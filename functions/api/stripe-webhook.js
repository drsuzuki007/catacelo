/**
 * Cloudflare Pages Function: POST /api/stripe-webhook
 *
 * Stripe からの Webhook を受け取り、決済完了時にコインを付与する。
 * 署名検証は Web Crypto の HMAC-SHA256 で自前実装（Stripe SDK 不要）。
 *
 * 必要な環境変数:
 *   STRIPE_WEBHOOK_SECRET      whsec_...                 ※シークレットとして登録
 *   SUPABASE_URL               https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  service_role キー          ※シークレットとして登録
 *
 * Stripe ダッシュボードでの登録:
 *   エンドポイント URL: https://catacelo.com/api/stripe-webhook
 *   送信イベント:       checkout.session.completed
 *
 * 付与は catacelo.credit_purchase() が stripe_session_id で冪等化しているため、
 * Stripe の再送で二重付与されることはない。
 */

const DEFAULT_COINS = 50;
const TOLERANCE_SECONDS = 300; // タイムスタンプ許容差（リプレイ攻撃対策）

const encoder = new TextEncoder();

/** タイミング攻撃に強い比較 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stripe-Signature ヘッダーを検証する */
async function verifyStripeSignature(payload, signatureHeader, secret) {
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => {
      const idx = kv.indexOf("=");
      return [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()];
    })
  );

  const timestamp = parts.t;
  const provided = parts.v1;
  if (!timestamp || !provided) return false;

  // 古すぎる／未来すぎるリクエストを拒否
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));

  return timingSafeEqual(toHex(mac), provided);
}

/** Supabase の RPC を service_role で呼ぶ */
async function callRpc(env, fn, args) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Content-Profile": "catacelo",
    },
    body: JSON.stringify(args),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`rpc ${fn} failed: ${res.status} ${body}`);
  return body;
}

export async function onRequestPost({ request, env }) {
  for (const key of ["STRIPE_WEBHOOK_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!env[key]) return new Response(`server misconfigured: ${key}`, { status: 500 });
  }

  // 署名検証には生のボディが必要（パース前に文字列で読む）
  const payload = await request.text();
  const valid = await verifyStripeSignature(
    payload,
    request.headers.get("Stripe-Signature"),
    env.STRIPE_WEBHOOK_SECRET
  );
  if (!valid) return new Response("invalid signature", { status: 400 });

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("invalid payload", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    // 購読していない種類のイベントは 200 で受け流す（Stripe の再送を防ぐ）
    return new Response("ignored", { status: 200 });
  }

  const session = event.data?.object || {};

  // 支払いが実際に完了しているものだけを処理する
  if (session.payment_status !== "paid") {
    return new Response("not paid", { status: 200 });
  }

  const userId = session.metadata?.supabase_user_id || session.client_reference_id;
  const coins = Number(session.metadata?.coins) || DEFAULT_COINS;
  const amountJpy = Number(session.amount_total) || null;

  if (!userId) {
    // ユーザーが特定できない決済。200 を返して再送を止め、調査は Stripe 側のログで行う。
    console.error("stripe webhook: missing supabase_user_id", session.id);
    return new Response("missing user reference", { status: 200 });
  }

  try {
    await callRpc(env, "credit_purchase", {
      p_user_id: userId,
      p_stripe_session_id: session.id,
      p_coins: coins,
      p_amount_jpy: amountJpy,
    });
  } catch (err) {
    // 500 を返すと Stripe が再送してくれる（付与は冪等なので安全）
    console.error("stripe webhook: credit_purchase failed", String(err));
    return new Response("credit failed", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

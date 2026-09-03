/**
 * Cloudflare Pages Function: POST /api/checkout
 *
 * Stripe Checkout セッションを作成し、決済ページの URL を返す。
 *
 * 認証:
 *   Authorization: Bearer <Supabase アクセストークン>
 *   トークンは Supabase の /auth/v1/user で検証し、user.id を取得する。
 *
 * 必要な環境変数（Cloudflare Pages → 設定 → 変数とシークレット）:
 *   STRIPE_SECRET_KEY        sk_test_... / sk_live_...   ※シークレットとして登録
 *   STRIPE_PRICE_ID          price_...（コイン50枚パック ¥1,000）
 *   SUPABASE_URL             https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  service_role キー          ※シークレットとして登録
 *
 * Stripe SDK は使わず fetch で REST を直接叩く（Workers ランタイムで依存関係ゼロ）。
 */

const COINS_PER_PACK = 50;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

/** Supabase のアクセストークンを検証し、ユーザーIDを返す */
async function verifySupabaseUser(env, authHeader) {
  const token = (authHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!res.ok) return null;

  const user = await res.json();
  return user && user.id ? user.id : null;
}

export async function onRequestPost({ request, env }) {
  for (const key of ["STRIPE_SECRET_KEY", "STRIPE_PRICE_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!env[key]) return json({ error: `server misconfigured: ${key} is not set` }, 500);
  }

  const userId = await verifySupabaseUser(env, request.headers.get("Authorization"));
  if (!userId) return json({ error: "authentication required" }, 401);

  const origin = new URL(request.url).origin;

  // Stripe Checkout セッションを作成（application/x-www-form-urlencoded）
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("line_items[0][price]", env.STRIPE_PRICE_ID);
  form.set("line_items[0][quantity]", "1");
  form.set("success_url", `${origin}/catacelo-2pre.html?purchase=success&session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${origin}/catacelo-2pre.html?purchase=cancelled`);
  // Webhook でユーザーを特定するための紐付け
  form.set("client_reference_id", userId);
  form.set("metadata[supabase_user_id]", userId);
  form.set("metadata[coins]", String(COINS_PER_PACK));
  form.set("payment_intent_data[metadata][supabase_user_id]", userId);
  // 日本の消費者向け表示
  form.set("locale", "ja");

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const session = await stripeRes.json();
  if (!stripeRes.ok) {
    return json({ error: session?.error?.message || "failed to create checkout session" }, 502);
  }

  // 突合用に決済セッションを記録（失敗しても決済自体は継続させる）
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/stripe_checkouts`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        "Content-Profile": "catacelo",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        session_id: session.id,
        user_id: userId,
        status: "created",
        coins: COINS_PER_PACK,
        amount_jpy: session.amount_total ?? null,
      }),
    });
  } catch (_) {
    /* 記録の失敗は決済を止めない。Webhook 側で補完される。 */
  }

  return json({ url: session.url, sessionId: session.id });
}

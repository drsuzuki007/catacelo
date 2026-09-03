/**
 * Catacelo コインウォレット クライアント
 *
 * 静的HTMLページ（catacelo-2pre.html / catacelo-3pre.html）から使う、
 * サーバー残高＋Stripe決済のための最小ライブラリ。ビルド不要の素の JS。
 *
 * localStorage の残高はデモ用であり、実際にお金を頂く以上は必ずこちらを使う。
 *
 * 使い方:
 *   <script type="module">
 *     import { CataceloWallet } from './coin-wallet.js';
 *     const wallet = await CataceloWallet.init();
 *     document.getElementById('creditBalance').textContent = wallet.balance;
 *
 *     // コインショップの購入ボタン
 *     shopBuyBtn.onclick = () => wallet.startCheckout();
 *
 *     // 逆転の一手（3コイン）／ヒント（1コイン）
 *     const rest = await wallet.spend(3, 'comeback_move');
 *   </script>
 */

const SUPABASE_URL = "https://kxdwcnzxrujsagljbvqe.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_YzwwvEY6n5f4aXoVCKl8Ng_irdJR2s9";

const SESSION_KEY = "catacelo_auth_session_v1";

/** 保存済みセッションを読む */
function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* プライベートモード等では保存できない。セッションはメモリ内のみになる。 */
  }
}

async function authFetch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.msg || data?.error_description || `auth ${path} failed`);
  return data;
}

/** 匿名サインイン。既存セッションがあれば再利用し、期限切れならリフレッシュする。 */
async function ensureSession() {
  let session = loadSession();

  if (session?.refresh_token && session?.expires_at) {
    // 期限の60秒前から更新する
    if (session.expires_at * 1000 > Date.now() + 60_000) return session;
    try {
      session = await authFetch("token?grant_type=refresh_token", {
        refresh_token: session.refresh_token,
      });
      saveSession(session);
      return session;
    } catch {
      session = null; // リフレッシュ失敗時は作り直す
    }
  }

  session = await authFetch("signup", {}); // 匿名サインイン
  saveSession(session);
  return session;
}

async function rpc(session, fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      "Content-Profile": "catacelo",
      Accept: "application/json",
    },
    body: JSON.stringify(args ?? {}),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = JSON.parse(text).message || text;
    } catch {
      /* テキストのまま使う */
    }
    throw new Error(message);
  }
  return text ? JSON.parse(text) : null;
}

export class CataceloWallet {
  constructor(session, balance) {
    this.session = session;
    this.balance = balance;
    this.listeners = new Set();
  }

  static async init() {
    const session = await ensureSession();
    const balance = await rpc(session, "get_coin_balance", {});
    const wallet = new CataceloWallet(session, Number(balance) || 0);
    await wallet.#handleReturnFromCheckout();
    return wallet;
  }

  /** 残高が変わったときに呼ばれるコールバックを登録する */
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  #emit() {
    for (const fn of this.listeners) fn(this.balance);
  }

  /** サーバーから残高を取り直す */
  async refresh() {
    this.session = await ensureSession();
    this.balance = Number(await rpc(this.session, "get_coin_balance", {})) || 0;
    this.#emit();
    return this.balance;
  }

  /** 有効期限ごとの残高内訳（「◯月◯日に◯コイン失効」表示用） */
  async lots() {
    this.session = await ensureSession();
    return (await rpc(this.session, "get_coin_lots", {})) || [];
  }

  /** 初回スターターボーナス（サーバー側で1回だけ付与される） */
  async claimStarterBonus(coins = 5) {
    this.session = await ensureSession();
    this.balance = Number(await rpc(this.session, "grant_starter_bonus", { p_coins: coins })) || 0;
    this.#emit();
    return this.balance;
  }

  /**
   * コインを消費する。
   * @param {number} amount 消費枚数（逆転の一手=3、ヒント=1）
   * @param {'comeback_move'|'hint'} reason
   * @returns {Promise<number>} 消費後の残高
   * @throws 残高不足のとき
   */
  async spend(amount, reason) {
    this.session = await ensureSession();
    this.balance = Number(await rpc(this.session, "spend_coins", { p_amount: amount, p_reason: reason })) || 0;
    this.#emit();
    return this.balance;
  }

  /** Stripe Checkout へ遷移する（コイン50枚パック ¥1,000） */
  async startCheckout() {
    this.session = await ensureSession();
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.session.access_token}`,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.error || "決済ページを開けませんでした");
    window.location.href = data.url;
  }

  /**
   * Checkout から戻ってきた直後の処理。
   * Webhook の到達が数秒遅れることがあるため、残高が増えるまで少しだけ待つ。
   */
  async #handleReturnFromCheckout() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("purchase") !== "success") return;

    const before = this.balance;
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      await this.refresh();
      if (this.balance > before) break;
    }

    // 履歴に ?purchase=success を残さない
    params.delete("purchase");
    params.delete("session_id");
    const query = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : ""));
  }
}

export default CataceloWallet;

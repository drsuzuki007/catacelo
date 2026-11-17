/**
 * Design: 「盤上の工房」— 接続設定を一箇所に閉じ、盤面UIを安全に保つ。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// publishable keyはブラウザ利用を前提とした公開キーであり、RLSとRPCがアクセスを制御する。
// デプロイ環境ではVITE_SUPABASE_*で上書きできるよう、環境変数を優先する。
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || "https://lnuihnjajdlxesdsjleb.supabase.co";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "sb_publishable_A7qYFkN558MyTFgZxah-5Q_3mRRvsKL";

/** 未設定時はトップ画面で導入案内を表示し、無効な外部通信を行わない。 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey && !supabaseUrl.includes("YOUR_PROJECT"));

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 12 } },
    })
  : null;

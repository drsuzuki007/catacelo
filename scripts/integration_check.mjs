/**
 * Cataceloの実Supabase統合確認。
 * 匿名ユーザー2人で、作成・参加・Realtime更新・投了・再戦・タイムアウト保護を順に確認する。
 */
import { createClient } from "@supabase/supabase-js";

const url = "https://lnuihnjajdlxesdsjleb.supabase.co";
const key = "sb_publishable_A7qYFkN558MyTFgZxah-5Q_3mRRvsKL";
const initialBoard = "0000000000000000000000000002100000012000000000000000000000000000";
const roomCode = `T${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function client() {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 12 } },
  });
}

async function createAnonymousPlayer(label) {
  const instance = client();
  const { data, error } = await instance.auth.signInAnonymously({ options: { data: { label } } });
  if (error || !data.user) throw new Error(`匿名認証に失敗しました: ${error?.message ?? "unknown"}`);
  return { instance, id: data.user.id };
}

function subscribeForGameUpdate(instance, gameId) {
  let resolveUpdate;
  let rejectUpdate;
  const update = new Promise((resolve, reject) => { resolveUpdate = resolve; rejectUpdate = reject; });
  const ready = new Promise((resolve, reject) => {
    const channel = instance
      .channel(`integration-check:${gameId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "catacelo", table: "games", filter: `id=eq.${gameId}` }, (payload) => {
        void instance.removeChannel(channel);
        resolveUpdate(payload.new);
      })
      .subscribe((state) => {
        if (state === "SUBSCRIBED") resolve();
        if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
          void instance.removeChannel(channel);
          reject(new Error(`Realtime購読に失敗しました: ${state}`));
          rejectUpdate(new Error(`Realtime購読に失敗しました: ${state}`));
        }
      });
    setTimeout(() => {
      void instance.removeChannel(channel);
      rejectUpdate(new Error("Realtime更新が20秒以内に届きませんでした"));
    }, 20_000);
  });
  return { ready, update };
}

async function main() {
  const host = await createAnonymousPlayer("integration-host");
  const guest = await createAnonymousPlayer("integration-guest");

  const { data: created, error: createError } = await host.instance.schema("catacelo").rpc("create_room", { p_nickname: "品質確認・黒" });
  if (createError || !created) throw new Error(`ルーム作成に失敗しました: ${createError?.message ?? "unknown"}`);

  const { error: directCreateError } = await host.instance.schema("catacelo").from("games").insert({
    room_code: "ZZZZZZ",
    status: "waiting",
    host_player_id: host.id,
    host_nickname: "直接書込み確認",
    board_state: initialBoard,
    current_turn: 1,
    move_count: 0,
    pass_streak: 0,
  });
  assert(Boolean(directCreateError), "直接INSERTが拒否されず、対局作成RPCを迂回できます");

  const realtimeSubscription = subscribeForGameUpdate(host.instance, created.id);
  await realtimeSubscription.ready;
  await new Promise((resolve) => setTimeout(resolve, 750));
  const { data: joined, error: joinError } = await guest.instance.schema("catacelo").rpc("join_room", {
    p_room_code: created.room_code,
    p_nickname: "品質確認・白",
  });
  if (joinError || !joined) throw new Error(`ルーム参加に失敗しました: ${joinError?.message ?? "unknown"}`);
  assert(joined.status === "playing", "参加後に対局状態へ移行していません");

  const realtimeGame = await realtimeSubscription.update;
  assert(realtimeGame.status === "playing", "Realtimeで対局開始のUPDATEを受信できませんでした");

  const { data: resigned, error: resignError } = await host.instance.schema("catacelo").rpc("submit_move", {
    p_game_id: created.id,
    p_expected_move_number: 1,
    p_move_type: "resign",
    p_from_pos: null,
    p_to_pos: null,
    p_board_after: initialBoard,
  });
  if (resignError || !resigned) throw new Error(`投了RPCに失敗しました: ${resignError?.message ?? "unknown"}`);
  assert(resigned.status === "finished" && resigned.winner === 2, "投了時の終局・勝者記録が不正です");

  const { data: rematch, error: rematchError } = await guest.instance.schema("catacelo").rpc("create_rematch", { p_game_id: created.id });
  if (rematchError || !rematch) throw new Error(`再戦RPCに失敗しました: ${rematchError?.message ?? "unknown"}`);
  assert(rematch.status === "playing" && rematch.move_count === 0, "再戦局を正しく作成できませんでした");

  const { error: earlyTimeoutError } = await guest.instance.schema("catacelo").rpc("claim_timeout_win", { p_game_id: rematch.id });
  assert(earlyTimeoutError?.message.includes("timeout_not_reached"), "5分未満のタイムアウト要求が拒否されませんでした");

  console.log(JSON.stringify({
    result: "passed",
    roomCode: created.room_code,
    gameId: created.id,
    checks: ["anonymous_auth", "secure_create_room_rpc", "direct_insert_rejected", "room_join", "realtime_update", "submit_move_resign", "create_rematch", "timeout_guard"],
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

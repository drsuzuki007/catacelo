/**
 * Design: 「盤上の工房」— 盤面を主役に、接続・手番・操作を卓上の帯として整理する。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@/stage2.css";
import { ArrowLeft, BookOpen, Check, Clipboard, Crown, Download, Info, Languages, LoaderCircle, LogOut, RotateCcw, Send, Settings, Share2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  BLACK, EMPTY, WHITE, applyMove, boardFromString, boardToString, countDiscs,
  createInitialBoard, flipsAt, genAllMoves, getWinner, isTerminal, posName,
  type Board, type GameMove,
} from "@/lib/game";
import { LANGUAGES, detectLanguageFromAccessCountry, hasExplicitLanguagePreference, initialLanguageSelection, saveLanguagePreference, translate, type Language, type LanguageSelection } from "@/lib/i18n";
import { applySeoLanguage } from "@/lib/seo";
import { buildResultShareUrl, buildXShareUrl, createResultShareImage } from "@/lib/resultShare";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Color, GameRecord, GameStatus, MoveRecord, PlayMode } from "@/lib/types";

type Screen = "lobby" | "waiting" | "game" | "history";
type HomeProps = { siteVariant?: "workshop" | "battle" };

const NICKNAME_KEY = "catacelo.nickname";
const ROOM_PATTERN = /^[A-Z0-9]{6}$/;
// Turnstileの接続障害を切り分ける間はfalse。サーバー側の行動レート制限は常時有効。
const TURNSTILE_ENABLED = false;

function renderModeMoves(board: Board, color: Color, mode: PlayMode, selected: number | null): Set<number> {
  const hints = new Set<number>();
  if (mode === "place") {
    for (let position = 0; position < 64; position += 1) {
      if (board[position] === EMPTY && flipsAt(board, position, color)) hints.add(position);
    }
  } else if (selected !== null) {
    const working = board.slice();
    working[selected] = EMPTY;
    for (let position = 0; position < 64; position += 1) {
      if (position !== selected && working[position] === EMPTY && flipsAt(working, position, color)) hints.add(position);
    }
  }
  return hints;
}

export default function Home({ siteVariant = "workshop" }: HomeProps) {
  // The useAuth hook provides authentication state.
  // To implement login/logout, call logout(), or start login from an event
  // handler: onClick={() => startLogin()} (imported from "@/const"). Never call
  // startLogin() during render (no href={startLogin()}) — it mints a one-time
  // nonce cookie and must run only at the moment of navigation.
  let { user, loading, error, isAuthenticated, logout } = useAuth();

  const [languageSelection, setLanguageSelection] = useState<LanguageSelection>(initialLanguageSelection);
  const language = languageSelection.language;
  const t = useCallback((key: string, values?: Record<string, string | number>) => translate(language, key, values), [language]);
  const [screen, setScreen] = useState<Screen>("lobby");
  const [nickname, setNickname] = useState(() => localStorage.getItem(NICKNAME_KEY) ?? "");
  const [roomInput, setRoomInput] = useState("");
  const [myId, setMyId] = useState<string | null>(null);
  const [game, setGame] = useState<GameRecord | null>(null);
  const [history, setHistory] = useState<GameRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [board, setBoard] = useState<Board>(createInitialBoard);
  const [mode, setMode] = useState<PlayMode>("place");
  const [selectedSource, setSelectedSource] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<MoveRecord | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [opponentOnline, setOpponentOnline] = useState(false);
  const [resignOpen, setResignOpen] = useState(false);
  const [timeoutOpen, setTimeoutOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [realtimeState, setRealtimeState] = useState<"connected" | "reconnecting">("connected");
  const audioContextRef = useRef<AudioContext | null>(null);
  const startedGameIdsRef = useRef(new Set<string>());
  const gameStatusRef = useRef<GameStatus | null>(null);
  const realtimeWarningShownRef = useRef(false);
  const hasManualLanguageRef = useRef(hasExplicitLanguagePreference());
  const isBattleSite = siteVariant === "battle";

  const myColor: Color | null = game && myId
    ? (game.host_player_id === myId ? BLACK : game.guest_player_id === myId ? WHITE : null)
    : null;
  const opponentName = game && myColor === BLACK ? game.guest_nickname : game?.host_nickname;
  const canMove = Boolean(game && myColor && game.status === "playing" && game.current_turn === myColor && !isWorking);
  const legalHints = useMemo(() => canMove && myColor ? renderModeMoves(board, myColor, mode, selectedSource) : new Set<number>(), [board, canMove, mode, myColor, selectedSource]);
  const [blackScore, whiteScore] = countDiscs(board);
  const lastMovePosition = lastMove?.to_pos ?? null;
  const hostWaitingAtBoard = Boolean(game && myColor === BLACK && game.status === "waiting" && screen === "game");

  useEffect(() => {
    document.documentElement.lang = language;
    applySeoLanguage(language);
    if (isBattleSite) document.title = "Catacelo Battle";
  }, [isBattleSite, language]);
  useEffect(() => {
    if (!isBattleSite) return;
    document.body.classList.add("catacelo-battle-body");
    return () => document.body.classList.remove("catacelo-battle-body");
  }, [isBattleSite]);
  useEffect(() => {
    if (!isBattleSite || game?.status !== "playing") return;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [game?.status, isBattleSite]);
  useEffect(() => { gameStatusRef.current = game?.status ?? null; }, [game?.status]);
  useEffect(() => {
    if (hasManualLanguageRef.current) return;
    void detectLanguageFromAccessCountry().then((countrySelection) => {
      if (countrySelection && !hasManualLanguageRef.current) setLanguageSelection(countrySelection);
    });
  }, []);

  /** 手動の選択は保存し、国・ブラウザによる初回推定より常に優先する。 */
  const selectLanguage = useCallback((nextLanguage: Language) => {
    hasManualLanguageRef.current = true;
    saveLanguagePreference(nextLanguage);
    setLanguageSelection({ language: nextLanguage, reason: "saved" });
    const url = new URL(window.location.href);
    url.searchParams.set("lang", nextLanguage);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  /** 外部音源に依存せず、対局開始を知らせる短い二音のチャイムを合成する。 */
  const playMatchStartChime = useCallback(() => {
    try {
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      const now = context.currentTime;
      [523.25, 659.25].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, now + index * 0.13);
        gain.gain.setValueAtTime(0.0001, now + index * 0.13);
        gain.gain.exponentialRampToValueAtTime(0.09, now + index * 0.13 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.13 + 0.22);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(now + index * 0.13);
        oscillator.stop(now + index * 0.13 + 0.24);
      });
    } catch {
      // 音声再生を許可しないブラウザでも対局開始自体は妨げない。
    }
  }, []);

  /** ユーザーの明示操作中に音声を有効化し、後続するRealtime通知の再生を許可する。 */
  const armStartChime = useCallback(() => {
    try {
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      if (context.state === "suspended") void context.resume();
    } catch {
      // 音声非対応環境では無音のまま対局を継続する。
    }
  }, []);

  const authenticateAnonymous = useCallback(async (token?: string) => {
    const client = supabase;
    if (!client) return;
    const { data: auth, error } = await client.auth.signInAnonymously(token ? { options: { captchaToken: token } } : undefined);
    if (error) { toast.error(t("connectionError")); return; }
    setMyId(auth.user?.id ?? null);
  }, [t]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    client.auth.getSession().then(({ data }) => {
      if (data.session?.user) setMyId(data.session.user.id);
      // CAPTCHAを一時停止している間は、既存のサーバー側レート制限の下で匿名認証を開始する。
      else if (!TURNSTILE_ENABLED) void authenticateAnonymous();
    });
  // 初回の既存セッション確認のみを実行する。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticateAnonymous]);

  useEffect(() => {
    const client = supabase;
    if (!client || !game) return;
    const gameId = game.id;
    const refreshSnapshot = () => {
      void client.schema("catacelo").from("games").select("*").eq("id", gameId).single().then(({ data, error }) => {
        if (!error && data) {
          const snapshot = data as GameRecord;
          setGame(snapshot);
          setBoard(boardFromString(snapshot.board_state));
        }
      });
    };
    const channel = client.channel(`game:${gameId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "catacelo", table: "games", filter: `id=eq.${game.id}` }, (payload) => {
        const updated = payload.new as GameRecord;
        if (gameStatusRef.current === "waiting" && updated.status === "playing" && !startedGameIdsRef.current.has(updated.id)) {
          startedGameIdsRef.current.add(updated.id);
          playMatchStartChime();
          toast.success(t("matchStarted"));
        }
        if (updated.rematch_game_id) {
          void client.schema("catacelo").from("games").select("*").eq("id", updated.rematch_game_id).single().then(({ data }) => {
            if (data) {
              const rematch = data as GameRecord;
              openGame(rematch, "game");
              window.history.replaceState({}, "", `?room=${rematch.room_code}`);
              toast.success(t("rematchCreated"));
            }
          });
          return;
        }
        gameStatusRef.current = updated.status;
        setGame(updated);
        setBoard(boardFromString(updated.board_state));
        setSelectedSource(null);
      })
      .on("postgres_changes", { event: "INSERT", schema: "catacelo", table: "moves", filter: `game_id=eq.${game.id}` }, (payload) => {
        const move = payload.new as MoveRecord;
        setLastMove(move);
        setBoard(boardFromString(move.board_after));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeState("connected");
          if (realtimeWarningShownRef.current) toast.success(t("reconnected"));
          realtimeWarningShownRef.current = false;
          refreshSnapshot();
        }
        if (status === "TIMED_OUT" || status === "CHANNEL_ERROR" || status === "CLOSED") {
          setRealtimeState("reconnecting");
          if (!realtimeWarningShownRef.current) {
            realtimeWarningShownRef.current = true;
            toast.message(t("reconnecting"));
          }
        }
      });
    return () => { client.removeChannel(channel); };
  }, [game?.id, playMatchStartChime, t]);

  useEffect(() => {
    const client = supabase;
    if (!client || !game || !myId || !myColor) return;
    const presence = client.channel(`game:${game.id}:presence`, { config: { presence: { key: myId } } });
    presence.on("presence", { event: "sync" }, () => {
      const attendees = Object.values(presence.presenceState()) as Array<Array<{ playerId?: string }>>;
      setOpponentOnline(attendees.some((entries) => entries.some((entry) => entry.playerId !== myId)));
    });
    presence.subscribe((status) => {
      if (status === "SUBSCRIBED") void presence.track({ playerId: myId, nickname: nickname.trim() || "Player", color: myColor, onlineAt: new Date().toISOString() });
    });
    return () => { void client.removeChannel(presence); };
  }, [game?.id, myColor, myId]);

  useEffect(() => {
    const client = supabase;
    if (!client || !myId) return;
    const parameters = new URLSearchParams(window.location.search);
    const joinCode = parameters.get("join")?.toUpperCase();
    if (joinCode && ROOM_PATTERN.test(joinCode)) {
      setRoomInput(joinCode);
      setScreen("lobby");
      toast.success(t("joinReady"));
      return;
    }
    const requestedRoom = parameters.get("room")?.toUpperCase();
    if (!requestedRoom || !ROOM_PATTERN.test(requestedRoom)) return;
    void client.schema("catacelo").from("games").select("*").eq("room_code", requestedRoom).maybeSingle().then(({ data }) => {
      if (!data) return;
      const restored = data as GameRecord;
      openGame(restored, restored.status === "waiting" ? "waiting" : "game");
      void client.schema("catacelo").from("moves").select("*").eq("game_id", restored.id).order("move_number", { ascending: false }).limit(1).maybeSingle().then(({ data: latestMove }) => setLastMove((latestMove as MoveRecord | null) ?? null));
      toast.success(t("roomRestored"));
    });
  // 初回URL復元だけを実行する。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  useEffect(() => {
    if (!game || !myColor || game.status !== "playing" || game.current_turn === myColor) return;
    const checkTimeout = () => { if (Date.now() - new Date(game.last_move_at).getTime() >= 5 * 60 * 1000) setTimeoutOpen(true); };
    checkTimeout();
    const timer = window.setInterval(checkTimeout, 15_000);
    return () => window.clearInterval(timer);
  }, [game, myColor]);

  function validName(): boolean {
    const clean = nickname.trim();
    if (clean.length < 1 || clean.length > 20) {
      toast.error(t("invalidNickname"));
      return false;
    }
    localStorage.setItem(NICKNAME_KEY, clean);
    return true;
  }

  function openGame(nextGame: GameRecord, nextScreen: Screen): void {
    setGame(nextGame);
    setBoard(boardFromString(nextGame.board_state));
    setMode("place");
    setSelectedSource(null);
    setLastMove(null);
    setScreen(nextScreen);
  }

  /** 言語指定を維持して、ルーム復元・招待に必要なURLだけを更新する。 */
  const updateBattleUrl = useCallback((parameter?: "room" | "join", code?: string) => {
    const query = new URLSearchParams();
    query.set("lang", language);
    if (parameter && code) query.set(parameter, code);
    window.history.replaceState({}, "", `${window.location.pathname}?${query.toString()}`);
  }, [language]);

  async function createRoom(): Promise<void> {
    if (!supabase || !myId || !validName()) return;
    armStartChime();
    setIsWorking(true);
    const { data, error } = await supabase.schema("catacelo").rpc("create_room", { p_nickname: nickname.trim() });
    setIsWorking(false);
    if (error || !data) { toast.error(error?.message.includes("rate_limited") ? t("rateLimited") : t("connectionError")); return; }
    openGame(data as GameRecord, "waiting");
    updateBattleUrl("room", (data as GameRecord).room_code);
    toast.success(t("waitingRoom"));
  }

  async function joinRoom(): Promise<void> {
    if (!supabase || !myId || !validName()) return;
    armStartChime();
    const roomCode = roomInput.trim().toUpperCase();
    if (!ROOM_PATTERN.test(roomCode)) { toast.error(t("invalidCode")); return; }
    setIsWorking(true);
    const { data, error } = await supabase.schema("catacelo").rpc("join_room", { p_room_code: roomCode, p_nickname: nickname.trim() });
    setIsWorking(false);
    if (error || !data) { toast.error(error?.message.includes("rate_limited") ? t("rateLimited") : t("roomNotFound")); return; }
    openGame(data as GameRecord, "game");
    updateBattleUrl("room", roomCode);
    if (!startedGameIdsRef.current.has((data as GameRecord).id)) {
      startedGameIdsRef.current.add((data as GameRecord).id);
      playMatchStartChime();
    }
    toast.success(t("joined"));
  }

  async function sendMove(move: GameMove | null, type: "place" | "move" | "pass" | "resign"): Promise<void> {
    if (!supabase || !game || !myColor || (type !== "resign" && !canMove)) return;
    const nextBoard = move ? applyMove(board, move, myColor) : board;
    const nextPassStreak = type === "pass" ? game.pass_streak + 1 : 0;
    const finished = isTerminal(nextBoard, nextPassStreak);
    const boardAfter = boardToString(nextBoard);
    setIsWorking(true);
    const { data: updated, error: gameError } = await supabase.schema("catacelo").rpc("submit_move", {
      p_game_id: game.id, p_expected_move_number: game.move_count + 1, p_move_type: type,
      p_from_pos: move?.from ?? null, p_to_pos: move?.to ?? null, p_board_after: boardAfter,
    });
    setIsWorking(false);
    if (gameError || !updated) { toast.error(t("connectionError")); return; }
    setGame(updated as GameRecord);
    setBoard(nextBoard);
    setSelectedSource(null);
  }

  /** 投了も submit_move へ送り、手順記録と勝敗確定を同時に行う。 */
  async function resign(): Promise<void> {
    await sendMove(null, "resign");
    setResignOpen(false);
  }

  /** 同じ2人だけを参加者として新局を発行するRPCを呼び出す。 */
  async function requestRematch(): Promise<void> {
    if (!supabase || !game) return;
    setIsWorking(true);
    const { data, error } = await supabase.schema("catacelo").rpc("create_rematch", { p_game_id: game.id });
    setIsWorking(false);
    if (error || !data) { toast.error(t("connectionError")); return; }
    const next = data as GameRecord;
    openGame(next, "game");
    updateBattleUrl("room", next.room_code);
    toast.success(t("rematchCreated"));
  }

  /** 待機側が選択した場合のみ、5分の無応答を勝利として確定する。 */
  async function claimTimeoutWin(): Promise<void> {
    if (!supabase || !game || !myColor) return;
    setIsWorking(true);
    const { data, error } = await supabase.schema("catacelo").rpc("claim_timeout_win", { p_game_id: game.id });
    setIsWorking(false);
    setTimeoutOpen(false);
    if (error || !data) { toast.error(t("connectionError")); return; }
    setGame(data as GameRecord);
    toast.success(t("timeoutCompleted"));
  }

  /** 参加者名・ルームコードを含めず、公開用の勝敗カードと対戦入口を共有する。 */
  function buildResultShare(): { file: File; text: string; url: string } {
    const url = buildResultShareUrl(window.location.href, language);
    const scoreText = t("shareScore", { black: blackScore, white: whiteScore });
    const text = `${t("shareHeadline")}\n${resultText}\n${scoreText}`;
    const file = createResultShareImage({
      title: "Catacelo Battle",
      result: resultText,
      scoreLabel: scoreText,
      blackLabel: t("black"),
      whiteLabel: t("white"),
      blackScore,
      whiteScore,
      footer: t("shareFooter"),
    });
    return { file, text, url };
  }

  function downloadResultImage(): void {
    try {
      const { file } = buildResultShare();
      const href = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = file.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
      toast.success(t("shareDownloaded"));
    } catch { toast.error(t("shareError")); }
  }

  async function shareResult(): Promise<void> {
    if (shareBusy) return;
    try {
      setShareBusy(true);
      const { file, text, url } = buildResultShare();
      const shareData = { title: "Catacelo Battle", text, url, files: [file] };
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
        toast.success(t("shared"));
        return;
      }
      downloadResultImage();
      await navigator.clipboard?.writeText(`${text}\n${url}`);
      toast.success(t("shareFallback"));
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") toast.error(t("shareError"));
    } finally { setShareBusy(false); }
  }

  function shareResultOnX(): void {
    try {
      const { text, url } = buildResultShare();
      window.open(buildXShareUrl(text, url), "_blank", "noopener,noreferrer");
    } catch { toast.error(t("shareError")); }
  }

  function handleCell(position: number): void {
    if (!canMove || !myColor) { if (game?.status === "playing") toast.error(t("notYourTurn")); return; }
    if (mode === "place") {
      const flips = flipsAt(board, position, myColor);
      if (flips) void sendMove({ type: "place", to: position, flips }, "place");
      return;
    }
    if (selectedSource === null) { if (board[position] === myColor) setSelectedSource(position); return; }
    if (position === selectedSource) { setSelectedSource(null); return; }
    if (board[position] === myColor) { setSelectedSource(position); return; }
    const working = board.slice();
    working[selectedSource] = EMPTY;
    const flips = flipsAt(working, position, myColor);
    if (!flips) return;
    void sendMove({ type: "move", from: selectedSource, to: position, flips }, "move");
  }

  function backToLobby(): void {
    setScreen("lobby"); setGame(null); setLastMove(null); setBoard(createInitialBoard());
    updateBattleUrl();
  }

  function returnToTop(): void {
    if (game?.status === "playing") { setLeaveOpen(true); return; }
    window.location.assign(`index.html?lang=${language}`);
  }

  async function openHistory(): Promise<void> {
    if (!supabase || !myId) return;
    setHistoryLoading(true);
    const { data, error } = await supabase.schema("catacelo").from("games").select("*")
      .or(`host_player_id.eq.${myId},guest_player_id.eq.${myId}`).order("created_at", { ascending: false }).limit(50);
    setHistoryLoading(false);
    if (error) { toast.error(t("connectionError")); return; }
    setHistory((data as GameRecord[] | null) ?? []);
    setScreen("history");
  }

  function openHistoricGame(match: GameRecord): void {
    openGame(match, match.status === "waiting" ? "waiting" : "game");
    updateBattleUrl("room", match.room_code);
  }

  /** 主催者だけが、黒番の初期盤面で対戦相手の着席を待つ画面へ移る。 */
  function enterHostWaitingBoard(): void {
    if (!game || game.status !== "waiting" || myColor !== BLACK) return;
    armStartChime();
    openGame(game, "game");
    toast.message(t("waitingAtBoard"));
  }

  const hasAnyMove = Boolean(myColor && genAllMoves(board, myColor).length > 0);
  const activeColor = game?.status === "playing" ? game.current_turn : hostWaitingAtBoard ? BLACK : null;
  const activeColorName = activeColor === BLACK ? t("black") : t("white");
  const activePlayerName = activeColor === BLACK ? game?.host_nickname ?? "…" : game?.guest_nickname || "…";
  const statusText = hostWaitingAtBoard ? t("hostWaitingTurn", { color: t("black") }) : game?.status === "waiting" ? t("waitingStart") : game?.status === "finished" ? `${t("score")}: ${blackScore} — ${whiteScore}` : canMove ? t("yourTurnColor", { color: myColor === BLACK ? t("black") : t("white") }) : t("opponentTurnColor", { name: activePlayerName, color: activeColorName });
  const resultText = game?.winner === BLACK ? t("resultBlack") : game?.winner === WHITE ? t("resultWhite") : t("resultDraw");
  const opponentPassed = Boolean(lastMove && lastMove.move_type === "pass" && myColor && lastMove.player_color !== myColor);

  return (
    <div className={`app-shell ${isBattleSite ? "battle-site" : ""}`}>
      {isBattleSite && <button id="catacelo-home-btn" type="button" onClick={returnToTop}><ArrowLeft size={15} />{t("homeBtn")}</button>}
      <header className={`masthead ${isBattleSite ? "battle-masthead" : ""}`}>
        {isBattleSite ? <div className="battle-lockup"><span className="battle-disc white" /><span className="battle-disc black" /><div><span>CATACELO</span><small>ONLINE MATCH</small></div></div> : <div className="brand-lockup"><img src="/manus-storage/catacelo-logo-mark_d5829287.png" alt="Catacelo" /><div><span>CATACELO</span><small>{t("subtitle")}</small></div></div>}
        <Button variant="ghost" className="history-button" onClick={() => void openHistory()} disabled={!isSupabaseConfigured || !myId || historyLoading} aria-label={t("history")}><BookOpen size={20} strokeWidth={2.4} />{t("history")}</Button>
        {user?.role === "admin" && <a className="language-admin-link" href="/admin"><Settings size={15} />{t("languageSettings")}</a>}
        <div className="language-panel"><div className="language-select" aria-label={t("language")}><Languages size={16} />{LANGUAGES.map(({ code, label }) => <button key={code} className={language === code ? "active" : ""} onClick={() => selectLanguage(code)}>{label}</button>)}</div><p className="language-reason" aria-live="polite"><Info size={12} />{t("languageReason", { reason: t(`languageReason_${languageSelection.reason}`) })}</p><p className="language-manual-hint">{t("languageManualHint")}</p></div>
      </header>

      {!isSupabaseConfigured && <section className="setup-notice"><strong>{t("setup")}</strong><span>{t("setupDetail")}</span></section>}
      {isSupabaseConfigured && TURNSTILE_ENABLED && !myId && <section className="captcha-gate"><strong>{t("captchaTitle")}</strong><p>{t("captchaPrompt")}</p></section>}

      {screen === "lobby" && (
        <main className="lobby-stage">
          <section className="lobby-intro"><p className="eyebrow">{isBattleSite ? "STEP 2 · ONLINE BATTLE" : t("tableKicker")}</p><h1>{isBattleSite ? "Catacelo Battle" : "Catacelo"}</h1><p>{t("gameInfo")}</p><div className="hero-table"><span className="table-lamp" /><span className="table-pin pin-a" /><span className="table-pin pin-b" /></div></section>
          <section className="lobby-panel" aria-label="match lobby">
            <div className="panel-tilt" /><p className="section-kicker">{t("seatKicker")}</p><label><span className="seat-pin" />{t("nickname")}<Input maxLength={20} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder={t("nicknamePlaceholder")} /></label>
            <div className="match-actions"><Button className="primary-action" onClick={() => void createRoom()} disabled={!isSupabaseConfigured || !myId || isWorking}>{isWorking ? <LoaderCircle className="animate-spin" /> : <Crown />}{t("createTable")}</Button><div className="join-rule"><span>{t("joinRule")}</span></div><label><span className="seat-pin" />{t("roomCode")}<div className="code-field"><Input value={roomInput} onChange={(event) => setRoomInput(event.target.value.toUpperCase())} maxLength={6} placeholder={t("roomPlaceholder")} /><Button variant="outline" onClick={() => void joinRoom()} disabled={!isSupabaseConfigured || !myId || isWorking}>{t("takeSeat")}</Button></div></label></div>
          </section>
          <section className="rules-strip"><div><p className="section-kicker">{t("rules")}</p><p>{t("rule1")}</p></div><ol><li>{t("rule2")}</li><li>{t("rule3")}</li><li>{t("rule4")}</li></ol></section>
        </main>
      )}

      {screen === "history" && (
        <main className="history-stage"><section className="history-sheet"><div className="history-heading"><div><p className="section-kicker">MATCH LEDGER</p><h1>{t("historyTitle")}</h1></div><Button variant="ghost" onClick={backToLobby}><LogOut />{t("cancel")}</Button></div>{history.length === 0 ? <p className="history-empty">{t("historyEmpty")}</p> : <ol className="history-list">{history.map((match) => <li key={match.id}><div className="history-mark"><span className={`score-disc ${match.winner === WHITE ? "white" : "black"}`} /></div><div className="history-detail"><strong>{match.host_nickname} <small>vs</small> {match.guest_nickname || "…"}</strong><span>{new Date(match.created_at).toLocaleDateString(language)} · {match.status === "finished" ? t("finished") : match.status === "playing" ? t("playing") : t("waiting")}</span></div><div className="history-score">{match.status === "finished" ? (match.winner === BLACK ? t("black") : match.winner === WHITE ? t("white") : t("resultDraw")) : match.room_code}</div><Button variant="outline" onClick={() => openHistoricGame(match)}><UsersRound />{t("takeSeat")}</Button></li>)}</ol>}</section></main>
      )}

      {screen === "waiting" && game && (
        <main className="waiting-stage"><section className="waiting-card"><img src="/manus-storage/catacelo-lantern_d231fe4e.jpg" alt="" /><p className="section-kicker">{t("waiting")}</p><h1>{t("waitingRoom")}</h1><p>{t("shareCode")}</p><div className="room-code-display">{game.room_code}</div><Button className="copy-button" onClick={() => { void navigator.clipboard.writeText(game.room_code); toast.success(t("copied")); }}><Clipboard />{t("copy")}</Button><Button className="join-now-button" onClick={enterHostWaitingBoard}><Crown />{t("enterWaitingBoard")}</Button><Button variant="ghost" onClick={backToLobby}><LogOut />{t("cancel")}</Button></section></main>
      )}

      {screen === "game" && game && (
        <main className="game-stage">
          <section className="game-topline"><Button variant="ghost" className="exit-button" onClick={backToLobby}><LogOut />{t("cancel")}</Button><div className="room-chip"><UsersRound size={15} /><span>{game.room_code}</span></div><div className={`connection-chip ${realtimeState === "reconnecting" ? "reconnecting" : hostWaitingAtBoard ? "waiting" : opponentOnline ? "" : "away"}`}><i />{realtimeState === "reconnecting" ? t("reconnecting") : hostWaitingAtBoard ? t("waitingStart") : opponentOnline ? t("opponentOnline") : t("opponentAway")}</div></section>
          <section className="table-layout">
            <section className="board-section"><div className={`turn-banner ${canMove ? "your-turn" : ""} ${hostWaitingAtBoard ? "host-waiting" : ""}`}><div className="turn-identity">{activeColor && <span className={`turn-disc ${activeColor === BLACK ? "black" : "white"}`} aria-label={activeColor === BLACK ? t("black") : t("white")} />}<div><strong>{statusText}</strong><small>{hostWaitingAtBoard ? t("waitingBoardDetail") : t("moveNo", { count: game.move_count + 1 })}</small></div></div><span className="mode-note">{mode === "place" ? t("modePlace") : t("modeMove")}</span></div>{opponentPassed && <p className="opponent-pass-note">{t("opponentPassed")}</p>}<div className={`board-frame ${!canMove && game.status === "playing" ? "awaiting" : ""} ${hostWaitingAtBoard ? "host-waiting" : ""}`}>{hostWaitingAtBoard && <div className="board-waiting-notice" role="status" aria-live="polite"><span className="turn-disc black" /><div><strong>{t("waitingBoardTitle")}</strong><small>{t("waitingBoardDetail")}</small></div></div>}{game.status === "finished" && <div className="board-result" role="status"><strong>{resultText}</strong><span>{blackScore} — {whiteScore}</span></div>}<div className="board" role="grid" aria-label="Catacelo board">{board.map((value, position) => <button key={position} role="gridcell" aria-label={posName(position)} onClick={() => handleCell(position)} className={`board-cell ${legalHints.has(position) ? "hint" : ""} ${selectedSource === position ? "selected" : ""}`}>{value !== EMPTY && <span className={`disc ${value === BLACK ? "black" : "white"} ${lastMovePosition === position ? "last-move" : ""}`} />}</button>)}</div></div>{lastMove && lastMove.move_type !== "pass" && <p className="last-move-note">{t("lastMove")}: {lastMove.move_type === "move" ? t("moveFromTo", { from: posName(lastMove.from_pos ?? 0), to: posName(lastMove.to_pos ?? 0) }) : t("movePlace", { to: posName(lastMove.to_pos ?? 0) })}</p>}<section className={`match-bottom-tray ${canMove && !hasAnyMove ? "has-pass" : ""}`} aria-label={t("score")}><div className="score-card black-score"><span className="score-disc black" /><span>{t("black")}</span><strong>{blackScore}</strong></div><Button className={`mode-choice ${mode === "place" ? "selected" : ""}`} onClick={() => { setMode("place"); setSelectedSource(null); }} disabled={!canMove}>{t("placeTo")}</Button><Button className={`mode-choice ${mode === "move" ? "selected" : ""}`} onClick={() => { setMode("move"); setSelectedSource(null); }} disabled={!canMove}>{t("moveTo")}</Button><div className="score-card white-score"><span className="score-disc white" /><span>{t("white")}</span><strong>{whiteScore}</strong></div>{canMove && !hasAnyMove && <Button className="pass-button tray-pass-button" onClick={() => void sendMove(null, "pass")}><RotateCcw />{t("passAction")}</Button>}</section></section>
          </section>
          <section className="control-dock"><Button className="resign-button" variant="ghost" disabled={!myColor || isWorking || game.status !== "playing"} onClick={() => setResignOpen(true)}>{t("resign")}</Button><Button className="retry-button" variant="outline" disabled={!myColor || isWorking || game.status !== "finished"} onClick={() => void requestRematch()}><UsersRound />{t("retryChallenge")}</Button></section>
          {game.status === "finished" && <section className="result-share-dock" aria-label={t("shareResult")}><div className="result-share-copy"><span>{t("shareKicker")}</span><strong>{t("shareResult")}</strong><small>{t("shareDetail")}</small></div><div className="result-share-actions"><Button className="native-share-button" onClick={() => void shareResult()} disabled={shareBusy}><Share2 />{shareBusy ? t("sharing") : t("shareWithImage")}</Button><Button className="x-share-button" variant="outline" onClick={shareResultOnX}><Send />{t("shareOnX")}</Button><Button className="download-share-button" variant="ghost" onClick={downloadResultImage}><Download />{t("downloadImage")}</Button></div></section>}
          <AlertDialog open={resignOpen} onOpenChange={setResignOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("resignConfirm")}</AlertDialogTitle><AlertDialogDescription>{t("resignDetail")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("cancelAction")}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => void resign()}>{t("confirm")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
          <AlertDialog open={timeoutOpen} onOpenChange={setTimeoutOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("timeoutTitle")}</AlertDialogTitle><AlertDialogDescription>{t("timeoutDetail")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("timeoutWait")}</AlertDialogCancel><AlertDialogAction onClick={() => void claimTimeoutWin()}>{t("timeoutWin")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
        </main>
      )}
      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("leaveBattleTitle")}</AlertDialogTitle><AlertDialogDescription>{t("leaveBattleDetail")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("cancelAction")}</AlertDialogCancel><AlertDialogAction onClick={() => window.location.assign(`index.html?lang=${language}`)}>{t("leaveBattleConfirm")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <a className="banner" href="https://www.hdc-atlas.com/zepbound" target="_blank" rel="noopener noreferrer" aria-label="Zepboundの詳細を新しいタブで開く"><img src="/manus-storage/banner_hdc_atlas_compliant_4a4a24a5.svg" alt="Zepbound" /></a>
    </div>
  );
}

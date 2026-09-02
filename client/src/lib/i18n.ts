/**
 * Design: 「盤上の工房」— 対局の言葉は短く、状況を明確に伝える。
 */
export type Language = "ja" | "en" | "zh" | "ko" | "es" | "fr";

type Dictionary = Record<string, string>;

export const LANGUAGES: Array<{ code: Language; label: string }> = [
  { code: "ja", label: "日本語" }, { code: "en", label: "EN" }, { code: "zh", label: "中文" },
  { code: "ko", label: "한국어" }, { code: "es", label: "ES" }, { code: "fr", label: "FR" },
];

/** 「盤上の工房」では、卓の言葉は利用者が明示した言語を常に最優先する。 */
/** 添付サイトと共通の保存キー。旧テスト版の値も読み取り時だけ引き継ぐ。 */
export const LANGUAGE_STORAGE_KEY = "catacelo_lang";
const LEGACY_LANGUAGE_STORAGE_KEY = "catacelo.language";
const SUPPORTED_LANGUAGES: Language[] = ["ja", "en", "zh", "ko", "es", "fr"];
export type LanguageSelectionReason = "url" | "saved" | "countryRule" | "country" | "browser" | "timezone" | "default";
export type LanguageSelection = { language: Language; reason: LanguageSelectionReason; country?: string };

const COUNTRY_LANGUAGES: Record<Language, string[]> = {
  ja: ["JP"],
  zh: ["CN", "TW", "HK", "MO"],
  ko: ["KR", "KP"],
  es: ["ES", "MX", "AR", "CO", "CL", "PE", "VE", "EC", "GT", "CU", "BO", "DO", "HN", "PY", "SV", "NI", "CR", "PA", "UY", "PR", "GQ"],
  fr: ["FR", "BE", "MC", "LU", "SN", "CI", "CM", "ML", "BF", "NE", "TG", "BJ", "GA", "CG", "CD", "MG", "TN", "DZ", "MA", "HT", "GN", "TD", "CF", "DJ", "KM", "BI", "RW", "SC", "MU", "NC", "PF", "RE", "GP", "MQ", "GF"],
  en: ["US", "GB", "AU", "CA", "NZ", "IE", "SG", "IN", "PH", "ZA", "NG", "KE", "GH", "MY", "PK", "JM", "TT", "BS", "BB", "FJ", "PG", "MT", "GI", "BM", "KY", "VG", "UG", "TZ", "ZM", "ZW", "BW", "LR", "SL", "GM"],
};

function toSupportedLanguage(value: string | null | undefined): Language | null {
  const normalized = value?.toLowerCase().split("-")[0] as Language | undefined;
  return normalized && SUPPORTED_LANGUAGES.includes(normalized) ? normalized : null;
}

export function getUrlLanguage(): Language | null {
  if (typeof window === "undefined") return null;
  return toSupportedLanguage(new URLSearchParams(window.location.search).get("lang"));
}

export function getSavedLanguage(): Language | null {
  if (typeof window === "undefined") return null;
  try {
    return toSupportedLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY))
      ?? toSupportedLanguage(window.localStorage.getItem(LEGACY_LANGUAGE_STORAGE_KEY));
  } catch { return null; }
}

export function hasExplicitLanguagePreference(): boolean {
  return Boolean(getUrlLanguage() || getSavedLanguage());
}

export function saveLanguagePreference(language: Language): void {
  try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* 保存不可でも表示は継続する。 */ }
}

export function languageFromBrowser(): Language | null {
  if (typeof navigator === "undefined") return null;
  const choices = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const choice of choices) {
    const language = toSupportedLanguage(choice);
    if (language) return language;
  }
  return null;
}

export function languageFromTimeZone(): Language | null {
  if (typeof Intl === "undefined") return null;
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    if (zone === "Asia/Tokyo") return "ja";
    if (/^Asia\/(Shanghai|Chongqing|Taipei|Hong_Kong|Macau|Macao)$/.test(zone)) return "zh";
    if (/^Asia\/(Seoul|Pyongyang)$/.test(zone)) return "ko";
    if (/^(Europe\/(Madrid|Ceuta)|Atlantic\/Canary|America\/(Mexico_City|Tijuana|Bogota|Santiago|Lima|Caracas|Guayaquil|Guatemala|Havana|La_Paz|Santo_Domingo|Tegucigalpa|Asuncion|El_Salvador|Managua|Costa_Rica|Panama|Montevideo|Puerto_Rico|Argentina\/.*))$/.test(zone)) return "es";
    if (/^(Europe\/(Paris|Brussels|Monaco|Luxembourg)|Africa\/(Dakar|Abidjan|Douala|Bamako|Ouagadougou|Niamey|Lome|Porto-Novo|Libreville|Brazzaville|Kinshasa|Tunis|Algiers|Casablanca)|America\/(Port-au-Prince|Martinique|Guadeloupe|Cayenne)|Pacific\/(Noumea|Tahiti))$/.test(zone)) return "fr";
    if (zone && !/^(Etc\/|UTC|GMT)/.test(zone)) return "en";
  } catch { /* 非対応ブラウザは既定値へ戻す。 */ }
  return null;
}

export function languageFromCountry(country: string | null | undefined): Language | null {
  const normalized = country?.toUpperCase();
  if (!normalized || normalized === "XX" || normalized === "T1") return null;
  for (const language of SUPPORTED_LANGUAGES) if (COUNTRY_LANGUAGES[language].includes(normalized)) return language;
  return "en";
}

function toSelectionReason(value: string | undefined): LanguageSelectionReason | null {
  return value && ["url", "saved", "countryRule", "country", "browser", "timezone", "default"].includes(value)
    ? value as LanguageSelectionReason
    : null;
}

export function initialLanguageSelection(): LanguageSelection {
  if (typeof window !== "undefined") {
    const bootstrapped = toSupportedLanguage(window.__CATACELO_INITIAL_LANGUAGE__);
    const bootstrapReason = toSelectionReason(window.__CATACELO_INITIAL_LANGUAGE_REASON__);
    if (bootstrapped && bootstrapReason) return { language: bootstrapped, reason: bootstrapReason };
  }
  const url = getUrlLanguage();
  if (url) return { language: url, reason: "url" };
  const saved = getSavedLanguage();
  if (saved) return { language: saved, reason: "saved" };
  const browser = languageFromBrowser();
  if (browser) return { language: browser, reason: "browser" };
  const timezone = languageFromTimeZone();
  if (timezone) return { language: timezone, reason: "timezone" };
  return { language: "ja", reason: "default" };
}

/** 既存版の6言語構造を保ち、AI専用表現を対人戦の文言へ置換する。 */
export const I18N: Record<Language, Dictionary> = {
  ja: {
    subtitle: "一手ずつ、同じ卓を囲む。", setup: "Supabaseの接続設定が必要です", setupDetail: "公開用URLと anon / publishable key を環境変数に設定してください。",
    nickname: "ニックネーム", nicknamePlaceholder: "盤上の名前", create: "対局を作る", join: "対局に参加する", roomCode: "ルームコード", roomPlaceholder: "例：A7K2P9",
    waiting: "対戦相手を待っています", shareCode: "このコードを相手に伝えてください", copied: "コードをコピーしました", copy: "コピー", cancel: "ロビーへ戻る",
    black: "黒", white: "白", host: "ホスト", guest: "参加者", yourTurn: "あなたの番です", opponentTurn: "{name}さんの番です", waitingStart: "相手の参加を待っています",
    place: "配置", move: "移動", modePlace: "配置モード", modeMove: "移動モード", pass: "パス", passHint: "有効手がないためパスできます", score: "スコア", moveNo: "第 {count} 手",
    rules: "ゲームルール", rule1: "基本ルールは通常のオセロと同じです。", rule2: "配置では、相手の駒を挟めるマスに駒を置きます。", rule3: "移動では自分の駒を一度取り外し、別の有効マスへ移せます。", rule4: "有効手がない場合はパスします。連続2回のパスまたは盤面が埋まると終了です。",
    waitingRoom: "ルームを開きました", roomNotFound: "待機中の対局が見つかりませんでした", joined: "対局に参加しました", connectionError: "通信に失敗しました。設定と接続を確認してください。", invalidNickname: "ニックネームを1〜20文字で入力してください。", invalidCode: "6桁の英数字コードを入力してください。", notYourTurn: "現在はあなたの手番ではありません。", noMoves: "有効な手がありません。パスしてください。",
    banner: "広告バナー枠", language: "言語", online: "接続済み", offline: "接続確認中", lastMove: "直前の着手", moveFromTo: "{from} → {to}", movePlace: "{to}", sync: "盤面を同期しました", gameInfo: "通常のオセロに「駒移動」ルールを加えた、2人用のリモート対局です。",
  },
  en: {
    subtitle: "Share one table, one move at a time.", setup: "Supabase connection is required", setupDetail: "Set the public URL and anon / publishable key as environment variables.", nickname: "Nickname", nicknamePlaceholder: "Name at the table", create: "Create match", join: "Join match", roomCode: "Room code", roomPlaceholder: "e.g. A7K2P9", waiting: "Waiting for an opponent", shareCode: "Share this code with your opponent", copied: "Code copied", copy: "Copy", cancel: "Back to lobby", black: "Black", white: "White", host: "Host", guest: "Guest", yourTurn: "Your turn", opponentTurn: "{name}'s turn", waitingStart: "Waiting for an opponent to join", place: "Place", move: "Move", modePlace: "Place mode", modeMove: "Move mode", pass: "Pass", passHint: "No legal move — you may pass", score: "Score", moveNo: "Move {count}", rules: "How to play", rule1: "The basic rules are the same as standard Othello.", rule2: "In Place mode, set a piece where it brackets opposing pieces.", rule3: "In Move mode, lift one of your pieces and move it to another legal square.", rule4: "Pass when no move is available. Two consecutive passes or a full board ends the match.", waitingRoom: "Room created", roomNotFound: "No waiting match was found", joined: "Joined the match", connectionError: "Connection failed. Check your setup and network.", invalidNickname: "Enter a nickname of 1–20 characters.", invalidCode: "Enter a six-character room code.", notYourTurn: "It is not your turn.", noMoves: "No legal moves. Please pass.", banner: "Advertisement banner area", language: "Language", online: "Connected", offline: "Checking connection", lastMove: "Last move", moveFromTo: "{from} → {to}", movePlace: "{to}", sync: "Board synchronized", gameInfo: "A two-player remote match that adds piece movement to standard Othello.",
  },
  zh: {
    subtitle: "一步一步，共享同一张棋桌。", setup: "需要配置 Supabase 连接", setupDetail: "请在环境变量中设置公开 URL 和 anon / publishable key。", nickname: "昵称", nicknamePlaceholder: "棋盘上的名字", create: "创建对局", join: "加入对局", roomCode: "房间代码", roomPlaceholder: "例如：A7K2P9", waiting: "正在等待对手", shareCode: "请将此代码告诉对手", copied: "代码已复制", copy: "复制", cancel: "返回大厅", black: "黑", white: "白", host: "房主", guest: "参加者", yourTurn: "轮到你了", opponentTurn: "轮到 {name}", waitingStart: "等待对手加入", place: "落子", move: "移动", modePlace: "落子模式", modeMove: "移动模式", pass: "跳过", passHint: "没有合法着法，可以跳过", score: "比分", moveNo: "第 {count} 手", rules: "游戏规则", rule1: "基本规则与标准黑白棋相同。", rule2: "在落子模式中，将棋子放到可以夹住对方棋子的位置。", rule3: "在移动模式中，可以取下一枚自己的棋子并移动到其他合法格。", rule4: "没有可走之处时跳过。连续两次跳过或棋盘填满时结束。", waitingRoom: "房间已创建", roomNotFound: "未找到等待中的对局", joined: "已加入对局", connectionError: "连接失败。请检查设置和网络。", invalidNickname: "请输入 1–20 个字符的昵称。", invalidCode: "请输入六码字母数字房间代码。", notYourTurn: "现在不是你的回合。", noMoves: "没有合法着法，请跳过。", banner: "广告横幅区域", language: "语言", online: "已连接", offline: "正在检查连接", lastMove: "上一手", moveFromTo: "{from} → {to}", movePlace: "{to}", sync: "棋盘已同步", gameInfo: "在标准黑白棋基础上加入棋子移动规则的双人远程对局。",
  },
  ko: {
    subtitle: "한 수씩, 같은 판을 마주합니다.", setup: "Supabase 연결 설정이 필요합니다", setupDetail: "공개 URL과 anon / publishable key를 환경 변수에 설정하세요.", nickname: "닉네임", nicknamePlaceholder: "보드 위의 이름", create: "대국 만들기", join: "대국 참가", roomCode: "룸 코드", roomPlaceholder: "예: A7K2P9", waiting: "상대를 기다리는 중", shareCode: "이 코드를 상대에게 알려 주세요", copied: "코드를 복사했습니다", copy: "복사", cancel: "로비로", black: "흑", white: "백", host: "호스트", guest: "참가자", yourTurn: "내 차례입니다", opponentTurn: "{name}님의 차례", waitingStart: "상대의 참가를 기다리는 중", place: "놓기", move: "이동", modePlace: "놓기 모드", modeMove: "이동 모드", pass: "패스", passHint: "유효한 수가 없어 패스할 수 있습니다", score: "점수", moveNo: "{count}수", rules: "게임 규칙", rule1: "기본 규칙은 일반 오셀로와 같습니다。", rule2: "놓기 모드에서 상대 말을 끼울 수 있는 칸에 둡니다。", rule3: "이동 모드에서는 자신의 말 하나를 들어 다른 유효 칸으로 옮깁니다。", rule4: "유효한 수가 없으면 패스합니다. 연속 2회 패스 또는 판이 차면 끝납니다。", waitingRoom: "룸을 만들었습니다", roomNotFound: "대기 중인 대국을 찾을 수 없습니다", joined: "대국에 참가했습니다", connectionError: "연결에 실패했습니다. 설정과 네트워크를 확인하세요。", invalidNickname: "1–20자의 닉네임을 입력하세요。", invalidCode: "6자리 영숫자 룸 코드를 입력하세요。", notYourTurn: "현재 내 차례가 아닙니다。", noMoves: "유효한 수가 없습니다. 패스하세요。", banner: "광고 배너 영역", language: "언어", online: "연결됨", offline: "연결 확인 중", lastMove: "직전 수", moveFromTo: "{from} → {to}", movePlace: "{to}", sync: "판을 동기화했습니다", gameInfo: "일반 오셀로에 말 이동 규칙을 더한 2인 원격 대국입니다。",
  },
  es: {
    subtitle: "Una mesa compartida, una jugada a la vez.", setup: "Se requiere conexión con Supabase", setupDetail: "Configura la URL pública y la clave anon / publishable como variables de entorno.", nickname: "Apodo", nicknamePlaceholder: "Tu nombre en la mesa", create: "Crear partida", join: "Unirse a partida", roomCode: "Código de sala", roomPlaceholder: "p. ej. A7K2P9", waiting: "Esperando rival", shareCode: "Comparte este código con tu rival", copied: "Código copiado", copy: "Copiar", cancel: "Volver al vestíbulo", black: "Negras", white: "Blancas", host: "Anfitrión", guest: "Invitado", yourTurn: "Tu turno", opponentTurn: "Turno de {name}", waitingStart: "Esperando que se una el rival", place: "Colocar", move: "Mover", modePlace: "Modo colocar", modeMove: "Modo mover", pass: "Pasar", passHint: "No hay jugadas legales; puedes pasar", score: "Marcador", moveNo: "Jugada {count}", rules: "Reglas", rule1: "Las reglas básicas son las mismas que en el Othello clásico.", rule2: "En modo colocar, pon una ficha donde encierre fichas rivales.", rule3: "En modo mover, retira una ficha propia y llévala a otra casilla válida.", rule4: "Pasa si no hay jugada. Dos pases seguidos o tablero lleno terminan la partida.", waitingRoom: "Sala creada", roomNotFound: "No se encontró una partida en espera", joined: "Te uniste a la partida", connectionError: "Falló la conexión. Revisa la configuración y la red.", invalidNickname: "Introduce un apodo de 1 a 20 caracteres.", invalidCode: "Introduce un código alfanumérico de seis caracteres.", notYourTurn: "No es tu turno.", noMoves: "No hay jugadas legales. Pasa el turno.", banner: "Espacio para banner publicitario", language: "Idioma", online: "Conectado", offline: "Comprobando conexión", lastMove: "Última jugada", moveFromTo: "{from} → {to}", movePlace: "{to}", sync: "Tablero sincronizado", gameInfo: "Partida remota para dos jugadores que añade movimiento de fichas al Othello clásico.",
  },
  fr: {
    subtitle: "La même table, un coup après l’autre.", setup: "La connexion Supabase est nécessaire", setupDetail: "Configurez l’URL publique et la clé anon / publishable dans les variables d’environnement.", nickname: "Pseudo", nicknamePlaceholder: "Votre nom à la table", create: "Créer une partie", join: "Rejoindre", roomCode: "Code de salon", roomPlaceholder: "ex. A7K2P9", waiting: "En attente d’un adversaire", shareCode: "Transmettez ce code à votre adversaire", copied: "Code copié", copy: "Copier", cancel: "Retour au salon", black: "Noirs", white: "Blancs", host: "Hôte", guest: "Invité", yourTurn: "À vous", opponentTurn: "À {name}", waitingStart: "En attente de votre adversaire", place: "Poser", move: "Déplacer", modePlace: "Mode pose", modeMove: "Mode déplacement", pass: "Passer", passHint: "Aucun coup légal : vous pouvez passer", score: "Score", moveNo: "Coup {count}", rules: "Règles", rule1: "Les règles de base sont les mêmes qu’à l’Othello classique.", rule2: "En mode pose, placez un pion qui encadre les pions adverses.", rule3: "En mode déplacement, retirez un pion à vous et déplacez-le vers une case valide.", rule4: "Passez sans coup valide. Deux passes consécutives ou un plateau plein termine la partie.", waitingRoom: "Salon créé", roomNotFound: "Aucune partie en attente n’a été trouvée", joined: "Vous avez rejoint la partie", connectionError: "Échec de connexion. Vérifiez la configuration et le réseau.", invalidNickname: "Saisissez un pseudo de 1 à 20 caractères.", invalidCode: "Saisissez un code alphanumérique de six caractères.", notYourTurn: "Ce n’est pas votre tour.", noMoves: "Aucun coup légal. Passez votre tour.", banner: "Emplacement de bannière publicitaire", language: "Langue", online: "Connecté", offline: "Vérification de la connexion", lastMove: "Dernier coup", moveFromTo: "{from} → {to}", movePlace: "{to}", sync: "Plateau synchronisé", gameInfo: "Une partie à distance pour deux qui ajoute le déplacement de pions à l’Othello classique.",
  },
};

/** 第2段階の対局運用文言を6言語へ追加する。 */
const STAGE2: Record<Language, Dictionary> = {
  ja: { resign:"投了", resignConfirm:"投了しますか？", resignDetail:"この対局は終了し、相手の勝利になります。", confirm:"投了する", cancelAction:"キャンセル", rematch:"再戦を申し込む", rematchCreated:"新しい対局を開始しました", resultBlack:"黒の勝ち", resultWhite:"白の勝ち", resultDraw:"引き分け", opponentOnline:"相手はオンライン", opponentAway:"相手は離席中", roomRestored:"対局を復元しました", timeoutTitle:"相手の応答がありません", timeoutDetail:"最終着手から5分以上経過しています。", timeoutWin:"勝利として終了", timeoutWait:"このまま待つ", timeoutCompleted:"タイムアウト勝利として終了しました" },
  en: { resign:"Resign", resignConfirm:"Resign from this match?", resignDetail:"The match will end and your opponent will win.", confirm:"Resign", cancelAction:"Cancel", rematch:"Request rematch", rematchCreated:"A new match has started", resultBlack:"Black wins", resultWhite:"White wins", resultDraw:"Draw", opponentOnline:"Opponent online", opponentAway:"Opponent away", roomRestored:"Match restored", timeoutTitle:"Your opponent has not responded", timeoutDetail:"More than five minutes have passed since the last move.", timeoutWin:"End as a win", timeoutWait:"Keep waiting", timeoutCompleted:"Match ended as a timeout win" },
  zh: { resign:"认输", resignConfirm:"要认输吗？", resignDetail:"对局将结束，对手获胜。", confirm:"确认认输", cancelAction:"取消", rematch:"申请再战", rematchCreated:"新的对局已开始", resultBlack:"黑方胜", resultWhite:"白方胜", resultDraw:"平局", opponentOnline:"对手在线", opponentAway:"对手离席", roomRestored:"已恢复对局", timeoutTitle:"对手没有回应", timeoutDetail:"距离上一步已超过五分钟。", timeoutWin:"以胜利结束", timeoutWait:"继续等待", timeoutCompleted:"已按超时胜利结束" },
  ko: { resign:"기권", resignConfirm:"기권하시겠습니까?", resignDetail:"대국이 종료되고 상대가 승리합니다.", confirm:"기권하기", cancelAction:"취소", rematch:"재대국 신청", rematchCreated:"새 대국을 시작했습니다", resultBlack:"흑 승리", resultWhite:"백 승리", resultDraw:"무승부", opponentOnline:"상대 온라인", opponentAway:"상대 자리 비움", roomRestored:"대국을 복원했습니다", timeoutTitle:"상대의 응답이 없습니다", timeoutDetail:"마지막 착수 후 5분 이상 경과했습니다.", timeoutWin:"승리로 종료", timeoutWait:"계속 기다리기", timeoutCompleted:"시간 초과 승리로 종료했습니다" },
  es: { resign:"Rendirse", resignConfirm:"¿Abandonar esta partida?", resignDetail:"La partida terminará y ganará tu rival.", confirm:"Rendirse", cancelAction:"Cancelar", rematch:"Pedir revancha", rematchCreated:"Ha comenzado una nueva partida", resultBlack:"Ganan las negras", resultWhite:"Ganan las blancas", resultDraw:"Empate", opponentOnline:"Rival en línea", opponentAway:"Rival ausente", roomRestored:"Partida restaurada", timeoutTitle:"Tu rival no responde", timeoutDetail:"Han pasado más de cinco minutos desde la última jugada.", timeoutWin:"Terminar como victoria", timeoutWait:"Seguir esperando", timeoutCompleted:"La partida terminó por victoria de tiempo" },
  fr: { resign:"Abandonner", resignConfirm:"Abandonner cette partie ?", resignDetail:"La partie prendra fin et votre adversaire gagnera.", confirm:"Abandonner", cancelAction:"Annuler", rematch:"Demander une revanche", rematchCreated:"Une nouvelle partie a commencé", resultBlack:"Victoire des Noirs", resultWhite:"Victoire des Blancs", resultDraw:"Match nul", opponentOnline:"Adversaire en ligne", opponentAway:"Adversaire absent", roomRestored:"Partie restaurée", timeoutTitle:"Votre adversaire ne répond pas", timeoutDetail:"Plus de cinq minutes se sont écoulées depuis le dernier coup.", timeoutWin:"Terminer par victoire", timeoutWait:"Continuer d’attendre", timeoutCompleted:"La partie est terminée par victoire au temps" },
};

const STAGE3: Record<Language, Dictionary> = {
  ja: { tableKicker:"SHARED TABLE · No. 01", seatKicker:"あなたの席", createTable:"卓を開く", takeSeat:"卓につく", joinRule:"または" },
  en: { tableKicker:"SHARED TABLE · No. 01", seatKicker:"YOUR SEAT", createTable:"Open the table", takeSeat:"Take your seat", joinRule:"OR" },
  zh: { tableKicker:"共享棋桌 · No. 01", seatKicker:"你的座位", createTable:"开一张棋桌", takeSeat:"入座", joinRule:"或" },
  ko: { tableKicker:"함께하는 대국탁 · No. 01", seatKicker:"당신의 자리", createTable:"대국탁 열기", takeSeat:"자리에 앉기", joinRule:"또는" },
  es: { tableKicker:"MESA COMPARTIDA · No. 01", seatKicker:"TU ASIENTO", createTable:"Abrir la mesa", takeSeat:"Tomar asiento", joinRule:"O" },
  fr: { tableKicker:"TABLE PARTAGÉE · No. 01", seatKicker:"VOTRE PLACE", createTable:"Ouvrir la table", takeSeat:"Prendre place", joinRule:"OU" },
};

const STAGE4: Record<Language, Dictionary> = {
  ja: { history:"対局帳", historyTitle:"これまでの対局", historyEmpty:"まだ記録された対局はありません。", rateLimited:"短時間に操作が集中しています。少し待ってから再試行してください。", captchaTitle:"入場札を確認しています", captchaPrompt:"対局卓に着く前に、安全確認を完了してください。", captchaFailed:"確認を完了できませんでした。もう一度お試しください。", finished:"終了", playing:"対局中" },
  en: { history:"Match book", historyTitle:"Past matches", historyEmpty:"No matches have been recorded yet.", rateLimited:"Too many requests. Please wait a moment and try again.", captchaTitle:"Confirm your entry", captchaPrompt:"Complete the security check before taking a seat.", captchaFailed:"The security check could not be completed. Please try again.", finished:"Finished", playing:"In play" },
  zh: { history:"对局记录", historyTitle:"历次对局", historyEmpty:"尚无对局记录。", rateLimited:"操作过于频繁，请稍后再试。", captchaTitle:"进入确认", captchaPrompt:"请在入座前完成安全确认。", captchaFailed:"无法完成安全确认，请重试。", finished:"已结束", playing:"对局中" },
  ko: { history:"대국 기록", historyTitle:"지난 대국", historyEmpty:"아직 기록된 대국이 없습니다.", rateLimited:"요청이 너무 많습니다. 잠시 후 다시 시도하세요.", captchaTitle:"입장 확인", captchaPrompt:"착수 전에 보안 확인을 완료하세요.", captchaFailed:"보안 확인을 완료할 수 없습니다. 다시 시도하세요.", finished:"종료", playing:"대국 중" },
  es: { history:"Historial", historyTitle:"Partidas anteriores", historyEmpty:"Aún no hay partidas registradas.", rateLimited:"Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.", captchaTitle:"Confirma tu entrada", captchaPrompt:"Completa la comprobación antes de sentarte.", captchaFailed:"No se pudo completar la comprobación. Inténtalo de nuevo.", finished:"Finalizada", playing:"En juego" },
  fr: { history:"Historique", historyTitle:"Parties passées", historyEmpty:"Aucune partie enregistrée pour l’instant.", rateLimited:"Trop de requêtes. Patientez un instant avant de réessayer.", captchaTitle:"Confirmez votre entrée", captchaPrompt:"Terminez la vérification avant de prendre place.", captchaFailed:"La vérification n’a pas pu être terminée. Réessayez.", finished:"Terminée", playing:"En cours" },
};

const STAGE5: Record<Language, Dictionary> = {
  ja: { passAction:"パスする", opponentPassed:"相手がパスをしました" },
  en: { passAction:"Pass", opponentPassed:"Your opponent passed" },
  zh: { passAction:"跳过", opponentPassed:"对手已跳过" },
  ko: { passAction:"패스하기", opponentPassed:"상대가 패스했습니다" },
  es: { passAction:"Pasar", opponentPassed:"Tu rival ha pasado" },
  fr: { passAction:"Passer", opponentPassed:"Votre adversaire a passé" },
};

const STAGE6: Record<Language, Dictionary> = {
  ja: { placeTo:"配置へ", moveTo:"移動へ" },
  en: { placeTo:"Place", moveTo:"Move" },
  zh: { placeTo:"去落子", moveTo:"去移动" },
  ko: { placeTo:"놓기로", moveTo:"이동으로" },
  es: { placeTo:"Colocar", moveTo:"Mover" },
  fr: { placeTo:"Poser", moveTo:"Déplacer" },
};

const STAGE7: Record<Language, Dictionary> = {
  ja: { yourTurnColor:"あなたの（{color}）の番です", opponentTurnColor:"{name}さん（{color}）の番です" },
  en: { yourTurnColor:"Your turn ({color})", opponentTurnColor:"{name}'s turn ({color})" },
  zh: { yourTurnColor:"轮到你了（{color}）", opponentTurnColor:"轮到 {name}（{color}）" },
  ko: { yourTurnColor:"내 차례입니다（{color}）", opponentTurnColor:"{name}님의 차례（{color}）" },
  es: { yourTurnColor:"Tu turno ({color})", opponentTurnColor:"Turno de {name} ({color})" },
  fr: { yourTurnColor:"À vous ({color})", opponentTurnColor:"À {name} ({color})" },
};

const STAGE8: Record<Language, Dictionary> = {
  ja: { matchStarted:"対戦相手がそろいました。対局を開始します。" },
  en: { matchStarted:"Your opponent is here. The match begins." },
  zh: { matchStarted:"对手已就位，对局开始。" },
  ko: { matchStarted:"상대가 입장했습니다. 대국을 시작합니다." },
  es: { matchStarted:"Tu rival está listo. La partida comienza." },
  fr: { matchStarted:"Votre adversaire est prêt. La partie commence." },
};

const STAGE9: Record<Language, Dictionary> = {
  ja: { retryChallenge:"再挑戦をする" },
  en: { retryChallenge:"Try again" },
  zh: { retryChallenge:"再次挑战" },
  ko: { retryChallenge:"다시 도전하기" },
  es: { retryChallenge:"Jugar de nuevo" },
  fr: { retryChallenge:"Rejouer" },
};

const STAGE10: Record<Language, Dictionary> = {
  ja: { joinNow:"今すぐこのルームに入り、卓に参加する。", joinLinkCopied:"参加用リンクをコピーしました。相手に送ると、コードが入力済みの状態で卓に参加できます。", joinReady:"ルームコードを入力しました。名前を確認して「卓に参加」を押してください。" },
  en: { joinNow:"Join this room now", joinLinkCopied:"Join link copied. Share it with your opponent so their room code is ready.", joinReady:"Room code entered. Check your name and take your seat." },
  zh: { joinNow:"立即加入这个房间", joinLinkCopied:"已复制参加链接。发送给对手即可预填房间代码。", joinReady:"已填入房间代码，请确认名字后加入。" },
  ko: { joinNow:"지금 이 방에 참가하기", joinLinkCopied:"참가 링크를 복사했습니다. 상대에게 보내면 방 코드가 미리 입력됩니다.", joinReady:"방 코드가 입력되었습니다. 이름을 확인하고 참가하세요." },
  es: { joinNow:"Entrar en esta sala ahora", joinLinkCopied:"Enlace de entrada copiado. Compártelo para dejar el código listo.", joinReady:"Código de sala introducido. Comprueba tu nombre y entra." },
  fr: { joinNow:"Rejoindre cette salle", joinLinkCopied:"Lien d’accès copié. Partagez-le pour préremplir le code de la salle.", joinReady:"Code de salle saisi. Vérifiez votre nom et rejoignez la table." },
};

const STAGE11: Record<Language, Dictionary> = {
  ja: { reconnecting:"通信を復旧しています…", reconnected:"通信が復旧しました" },
  en: { reconnecting:"Restoring connection…", reconnected:"Connection restored" },
  zh: { reconnecting:"正在恢复连接…", reconnected:"连接已恢复" },
  ko: { reconnecting:"연결을 복구하는 중…", reconnected:"연결이 복구되었습니다" },
  es: { reconnecting:"Restableciendo conexión…", reconnected:"Conexión restablecida" },
  fr: { reconnecting:"Rétablissement de la connexion…", reconnected:"Connexion rétablie" },
};

const STAGE12: Record<Language, Dictionary> = {
  ja: { enterWaitingBoard:"黒番として初期盤面で待機する", waitingAtBoard:"黒番の初期盤面で、対戦相手の着席を待っています。", hostWaitingTurn:"あなたは（{color}）です。対戦相手を待っています", waitingBoardTitle:"対戦相手の着席を待っています", waitingBoardDetail:"相手がこのルームに参加すると、短い音でお知らせして対局を開始できます。" },
  en: { enterWaitingBoard:"Wait at the opening board as Black", waitingAtBoard:"You are waiting at the opening board as Black.", hostWaitingTurn:"You are ({color}). Waiting for your opponent", waitingBoardTitle:"Waiting for your opponent to take a seat", waitingBoardDetail:"When they join this room, a short chime will announce that the match can begin." },
  zh: { enterWaitingBoard:"作为黑方在初始棋盘等待", waitingAtBoard:"您正以黑方身份在初始棋盘等待对手。", hostWaitingTurn:"您是（{color}），正在等待对手", waitingBoardTitle:"正在等待对手入座", waitingBoardDetail:"对手加入此房间后，会以短提示音通知您可以开始对局。" },
  ko: { enterWaitingBoard:"흑으로 초기 판에서 대기", waitingAtBoard:"흑으로 초기 판에서 상대를 기다리고 있습니다.", hostWaitingTurn:"당신은 {color}입니다. 상대를 기다리고 있습니다", waitingBoardTitle:"상대의 착석을 기다리는 중", waitingBoardDetail:"상대가 이 방에 입장하면 짧은 알림음과 함께 대국을 시작할 수 있습니다." },
  es: { enterWaitingBoard:"Esperar en el tablero inicial como negras", waitingAtBoard:"Esperas a tu rival en el tablero inicial como negras.", hostWaitingTurn:"Eres ({color}). Esperando a tu rival", waitingBoardTitle:"Esperando a que tu rival tome asiento", waitingBoardDetail:"Cuando entre en esta sala, un breve sonido avisará que la partida puede comenzar." },
  fr: { enterWaitingBoard:"Attendre sur le plateau initial avec les Noirs", waitingAtBoard:"Vous attendez votre adversaire sur le plateau initial avec les Noirs.", hostWaitingTurn:"Vous êtes les {color}. En attente de votre adversaire", waitingBoardTitle:"En attente de votre adversaire à la table", waitingBoardDetail:"Lorsqu’il rejoint cette table, un court signal vous avertira que la partie peut commencer." },
};

const STAGE13: Record<Language, Dictionary> = {
  ja: { languageSettings:"言語設定", languageReason:"表示言語：{reason}", languageManualHint:"言語ボタンから変更できます", languageReason_url:"URLで指定", languageReason_saved:"保存した選択", languageReason_countryRule:"この国の運用設定", languageReason_country:"アクセス元の国", languageReason_browser:"ブラウザの言語", languageReason_timezone:"端末のタイムゾーン", languageReason_default:"既定の言語" },
  en: { languageSettings:"Language settings", languageReason:"Language: {reason}", languageManualHint:"Change it with the language buttons", languageReason_url:"selected in the URL", languageReason_saved:"your saved choice", languageReason_countryRule:"this country’s site setting", languageReason_country:"your access country", languageReason_browser:"your browser language", languageReason_timezone:"your device time zone", languageReason_default:"the default language" },
  zh: { languageSettings:"语言设置", languageReason:"显示语言：{reason}", languageManualHint:"可通过语言按钮更改", languageReason_url:"由网址指定", languageReason_saved:"已保存的选择", languageReason_countryRule:"此国家/地区的网站设置", languageReason_country:"访问所在国家/地区", languageReason_browser:"浏览器语言", languageReason_timezone:"设备时区", languageReason_default:"默认语言" },
  ko: { languageSettings:"언어 설정", languageReason:"표시 언어: {reason}", languageManualHint:"언어 버튼으로 변경할 수 있습니다", languageReason_url:"URL 지정", languageReason_saved:"저장한 선택", languageReason_countryRule:"이 국가의 사이트 설정", languageReason_country:"접속 국가", languageReason_browser:"브라우저 언어", languageReason_timezone:"기기 시간대", languageReason_default:"기본 언어" },
  es: { languageSettings:"Ajustes de idioma", languageReason:"Idioma: {reason}", languageManualHint:"Puedes cambiarlo con los botones de idioma", languageReason_url:"indicado en la URL", languageReason_saved:"tu elección guardada", languageReason_countryRule:"la configuración de este país", languageReason_country:"tu país de acceso", languageReason_browser:"el idioma del navegador", languageReason_timezone:"la zona horaria del dispositivo", languageReason_default:"el idioma predeterminado" },
  fr: { languageSettings:"Réglages de langue", languageReason:"Langue : {reason}", languageManualHint:"Modifiez-la avec les boutons de langue", languageReason_url:"indiquée dans l’URL", languageReason_saved:"votre choix enregistré", languageReason_countryRule:"le réglage de ce pays", languageReason_country:"votre pays d’accès", languageReason_browser:"la langue du navigateur", languageReason_timezone:"le fuseau horaire de l’appareil", languageReason_default:"la langue par défaut" },
};

const STAGE14: Record<Language, Dictionary> = {
  ja: { homeBtn:"トップへ戻る", leaveBattleTitle:"対局を離れますか？", leaveBattleDetail:"進行中の対局を離れても、対局自体は終了しません。ルームコードを使うと戻れます。", leaveBattleConfirm:"トップへ戻る" },
  en: { homeBtn:"Back to top", leaveBattleTitle:"Leave this match?", leaveBattleDetail:"The match will remain available. You can return using the room code.", leaveBattleConfirm:"Back to top" },
  zh: { homeBtn:"返回首页", leaveBattleTitle:"要离开对局吗？", leaveBattleDetail:"对局不会结束。您可以使用房间代码返回。", leaveBattleConfirm:"返回首页" },
  ko: { homeBtn:"처음으로", leaveBattleTitle:"대국을 나가시겠습니까?", leaveBattleDetail:"대국은 종료되지 않습니다. 룸 코드로 다시 돌아올 수 있습니다.", leaveBattleConfirm:"처음으로" },
  es: { homeBtn:"Volver al inicio", leaveBattleTitle:"¿Salir de la partida?", leaveBattleDetail:"La partida seguirá disponible. Puedes volver con el código de sala.", leaveBattleConfirm:"Volver al inicio" },
  fr: { homeBtn:"Retour à l’accueil", leaveBattleTitle:"Quitter cette partie ?", leaveBattleDetail:"La partie restera disponible. Vous pourrez revenir avec le code de salon.", leaveBattleConfirm:"Retour à l’accueil" },
};

const STAGE15: Record<Language, Dictionary> = {
  ja: { shareKicker:"MATCH RESULT", shareResult:"結果をシェア", shareDetail:"勝敗とスコアの画像を作って、SNSやメッセージで送れます。", shareWithImage:"画像付きで共有", shareOnX:"Xで共有", downloadImage:"画像を保存", sharing:"共有を準備中…", shared:"共有しました", shareDownloaded:"共有画像を保存しました", shareFallback:"画像を保存し、共有文をコピーしました", shareError:"共有画像を作成できませんでした", shareHeadline:"Catacelo Battle の対局結果", shareScore:"黒 {black} — {white} 白", shareFooter:"駒を動かす、リモート対局" },
  en: { shareKicker:"MATCH RESULT", shareResult:"Share result", shareDetail:"Create a result image to send on social media or in a message.", shareWithImage:"Share with image", shareOnX:"Share on X", downloadImage:"Save image", sharing:"Preparing share…", shared:"Shared", shareDownloaded:"Result image saved", shareFallback:"Image saved and share text copied", shareError:"Could not create the share image", shareHeadline:"My Catacelo Battle result", shareScore:"Black {black} — {white} White", shareFooter:"A remote match where pieces can move" },
  zh: { shareKicker:"对局结果", shareResult:"分享结果", shareDetail:"生成胜败与比分图片，可发送到社交媒体或消息中。", shareWithImage:"带图片分享", shareOnX:"分享到 X", downloadImage:"保存图片", sharing:"正在准备分享…", shared:"已分享", shareDownloaded:"已保存结果图片", shareFallback:"已保存图片并复制分享文字", shareError:"无法生成分享图片", shareHeadline:"我的 Catacelo Battle 对局结果", shareScore:"黑方 {black} — {white} 白方", shareFooter:"可移动棋子的远程对局" },
  ko: { shareKicker:"대국 결과", shareResult:"결과 공유", shareDetail:"승패와 점수 이미지를 만들어 SNS나 메시지로 보낼 수 있습니다.", shareWithImage:"이미지와 공유", shareOnX:"X에 공유", downloadImage:"이미지 저장", sharing:"공유 준비 중…", shared:"공유했습니다", shareDownloaded:"결과 이미지를 저장했습니다", shareFallback:"이미지를 저장하고 공유 문구를 복사했습니다", shareError:"공유 이미지를 만들 수 없습니다", shareHeadline:"나의 Catacelo Battle 대국 결과", shareScore:"흑 {black} — {white} 백", shareFooter:"말을 움직이는 원격 대국" },
  es: { shareKicker:"RESULTADO", shareResult:"Compartir resultado", shareDetail:"Crea una imagen con el resultado y el marcador para redes o mensajes.", shareWithImage:"Compartir con imagen", shareOnX:"Compartir en X", downloadImage:"Guardar imagen", sharing:"Preparando…", shared:"Compartido", shareDownloaded:"Imagen guardada", shareFallback:"Imagen guardada y texto copiado", shareError:"No se pudo crear la imagen", shareHeadline:"Mi resultado de Catacelo Battle", shareScore:"Negras {black} — {white} Blancas", shareFooter:"Una partida remota con fichas móviles" },
  fr: { shareKicker:"RÉSULTAT", shareResult:"Partager le résultat", shareDetail:"Créez une image du résultat et du score à envoyer sur les réseaux ou par message.", shareWithImage:"Partager avec l’image", shareOnX:"Partager sur X", downloadImage:"Enregistrer l’image", sharing:"Préparation…", shared:"Partagé", shareDownloaded:"Image du résultat enregistrée", shareFallback:"Image enregistrée et texte copié", shareError:"Impossible de créer l’image", shareHeadline:"Mon résultat Catacelo Battle", shareScore:"Noirs {black} — {white} Blancs", shareFooter:"Une partie à distance avec déplacement de pions" },
};

export function detectLanguage(): Language {
  return initialLanguageSelection().language;
}

/** Cloudflare Pages Function またはNode配信の /geo を利用し、初回表示だけ国コードで精密化する。 */
export async function detectLanguageFromAccessCountry(): Promise<LanguageSelection | null> {
  if (typeof window === "undefined" || hasExplicitLanguagePreference()) return null;
  try {
    const response = await fetch("/geo", { cache: "no-store", signal: AbortSignal.timeout(1500) });
    if (!response.ok) return null;
    const payload = await response.json() as { country?: string; language?: string };
    const override = toSupportedLanguage(payload.language);
    const language = override ?? languageFromCountry(payload.country);
    return language ? { language, reason: override ? "countryRule" : "country", country: payload.country?.toUpperCase() } : null;
  } catch { return null; }
}

declare global {
  interface Window { __CATACELO_INITIAL_LANGUAGE__?: string; __CATACELO_INITIAL_LANGUAGE_REASON__?: string; }
}

export function translate(language: Language, key: string, values?: Record<string, string | number>): string {
  let text = I18N[language][key] ?? STAGE2[language][key] ?? STAGE3[language][key] ?? STAGE4[language][key] ?? STAGE5[language][key] ?? STAGE6[language][key] ?? STAGE7[language][key] ?? STAGE8[language][key] ?? STAGE9[language][key] ?? STAGE10[language][key] ?? STAGE11[language][key] ?? STAGE12[language][key] ?? STAGE13[language][key] ?? STAGE14[language][key] ?? STAGE15[language][key] ?? I18N.ja[key] ?? STAGE2.ja[key] ?? STAGE3.ja[key] ?? STAGE4.ja[key] ?? STAGE5.ja[key] ?? STAGE6.ja[key] ?? STAGE7.ja[key] ?? STAGE8.ja[key] ?? STAGE9.ja[key] ?? STAGE10.ja[key] ?? STAGE11.ja[key] ?? STAGE12.ja[key] ?? STAGE13.ja[key] ?? STAGE14.ja[key] ?? STAGE15.ja[key] ?? key;
  Object.entries(values ?? {}).forEach(([name, value]) => { text = text.replaceAll(`{${name}}`, String(value)); });
  return text;
}

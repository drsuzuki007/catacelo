export type SeoLanguage = "ja" | "en" | "zh" | "ko" | "es" | "fr";

export const SEO_LANGUAGES: SeoLanguage[] = ["ja", "en", "zh", "ko", "es", "fr"];

export const SEO_CONTENT: Record<SeoLanguage, { locale: string; title: string; description: string }> = {
  ja: { locale: "ja_JP", title: "Catacelo｜駒を動かすリモート対局", description: "通常のオセロに駒移動ルールを加えた、2人用のCataceloリモート対局。ルームコードで同じ卓につながります。" },
  en: { locale: "en_US", title: "Catacelo | A remote board match with moving pieces", description: "A two-player Catacelo match that adds piece movement to classic Othello. Share a room code and play at the same table." },
  zh: { locale: "zh_CN", title: "Catacelo｜可移动棋子的远程对局", description: "Catacelo 是一款在经典黑白棋中加入棋子移动规则的双人远程对局游戏。使用房间代码与对手同桌对弈。" },
  ko: { locale: "ko_KR", title: "Catacelo | 말을 움직이는 원격 대국", description: "일반 오셀로에 말 이동 규칙을 더한 2인용 Catacelo 원격 대국입니다. 룸 코드로 같은 탁자에 연결하세요." },
  es: { locale: "es_ES", title: "Catacelo | Partida remota con fichas móviles", description: "Catacelo es una partida remota para dos que añade movimiento de fichas al Othello clásico. Comparte un código de sala y juega en la misma mesa." },
  fr: { locale: "fr_FR", title: "Catacelo | Partie à distance avec pions mobiles", description: "Catacelo est une partie à distance pour deux qui ajoute le déplacement des pions à l’Othello classique. Partagez un code de salon pour jouer à la même table." },
};

export function asSeoLanguage(value: string | null | undefined): SeoLanguage | null {
  const normalized = value?.toLowerCase().split("-")[0] as SeoLanguage | undefined;
  return normalized && SEO_LANGUAGES.includes(normalized) ? normalized : null;
}

export function seoPath(language: SeoLanguage): string {
  return `/?lang=${language}`;
}

export function absoluteSeoUrl(origin: string, language: SeoLanguage): string {
  return `${origin.replace(/\/$/, "")}${seoPath(language)}`;
}

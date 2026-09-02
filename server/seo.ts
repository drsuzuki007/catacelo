import { SEO_CONTENT, SEO_LANGUAGES, absoluteSeoUrl, asSeoLanguage, type SeoLanguage } from "../shared/seo";

const FALLBACK_ORIGIN = "https://catacelo-btl-qxfrqdcy.manus.space";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** クローラーがJavaScriptを実行しなくても読める、言語別の最小SEOヘッドを生成する。 */
export function buildSeoHead(originalUrl: string): string {
  const search = originalUrl.includes("?") ? originalUrl.slice(originalUrl.indexOf("?")) : "";
  const language: SeoLanguage = asSeoLanguage(new URLSearchParams(search).get("lang")) ?? "ja";
  const content = SEO_CONTENT[language];
  const origin = (process.env.CANONICAL_ORIGIN || FALLBACK_ORIGIN).replace(/\/$/, "");
  const canonical = absoluteSeoUrl(origin, language);
  const tags = [
    `<title>${escapeHtml(content.title)}</title>`,
    `<meta name="description" content="${escapeHtml(content.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Catacelo" />`,
    `<meta property="og:title" content="${escapeHtml(content.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(content.description)}" />`,
    `<meta property="og:locale" content="${content.locale}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeHtml(content.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(content.description)}" />`,
    `<link rel="canonical" href="${canonical}" />`,
  ];
  for (const alternateLanguage of SEO_LANGUAGES) tags.push(`<link rel="alternate" hreflang="${alternateLanguage}" href="${absoluteSeoUrl(origin, alternateLanguage)}" />`);
  tags.push(`<link rel="alternate" hreflang="x-default" href="${absoluteSeoUrl(origin, "ja")}" />`);
  return tags.join("\n");
}

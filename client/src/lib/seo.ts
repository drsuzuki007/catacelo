import { SEO_CONTENT, SEO_LANGUAGES, absoluteSeoUrl, type SeoLanguage } from "@shared/seo";

function setMeta(selector: string, attribute: "name" | "property", value: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, value);
    document.head.appendChild(element);
  }
  element.content = content;
}

/** SPA内の言語変更後も、ブラウザ・共有UIが現在言語のメタ情報を参照できるよう同期する。 */
export function applySeoLanguage(language: SeoLanguage): void {
  const content = SEO_CONTENT[language];
  const origin = window.location.origin;
  const url = absoluteSeoUrl(origin, language);
  document.title = content.title;
  setMeta('meta[name="description"]', "name", "description", content.description);
  setMeta('meta[property="og:title"]', "property", "og:title", content.title);
  setMeta('meta[property="og:description"]', "property", "og:description", content.description);
  setMeta('meta[property="og:locale"]', "property", "og:locale", content.locale);
  setMeta('meta[property="og:url"]', "property", "og:url", url);
  setMeta('meta[name="twitter:title"]', "name", "twitter:title", content.title);
  setMeta('meta[name="twitter:description"]', "name", "twitter:description", content.description);

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = url;

  document.head.querySelectorAll('link[data-catacelo-hreflang="true"]').forEach((element) => element.remove());
  for (const alternateLanguage of SEO_LANGUAGES) {
    const alternate = document.createElement("link");
    alternate.rel = "alternate";
    alternate.hreflang = alternateLanguage;
    alternate.href = absoluteSeoUrl(origin, alternateLanguage);
    alternate.dataset.cataceloHreflang = "true";
    document.head.appendChild(alternate);
  }
  const fallback = document.createElement("link");
  fallback.rel = "alternate";
  fallback.hreflang = "x-default";
  fallback.href = absoluteSeoUrl(origin, "ja");
  fallback.dataset.cataceloHreflang = "true";
  document.head.appendChild(fallback);
}

import { describe, expect, it } from "vitest";
import { SEO_CONTENT, SEO_LANGUAGES } from "../shared/seo";
import { buildSeoHead } from "./seo";

describe("language SEO head", () => {
  it("creates French title, locale, canonical and alternate links from the lang query", () => {
    const head = buildSeoHead("/?lang=fr");
    expect(head).toContain("Catacelo | Partie à distance avec pions mobiles");
    expect(head).toContain('property="og:locale" content="fr_FR"');
    expect(head).toContain('rel="canonical" href="https://catacelo-btl-qxfrqdcy.manus.space/?lang=fr"');
    expect(head).toContain('hreflang="ja"');
    expect(head).toContain('hreflang="x-default"');
  });

  it("uses Japanese SEO when the language parameter is unsupported", () => {
    const head = buildSeoHead("/?lang=de");
    expect(head).toContain("Catacelo｜駒を動かすリモート対局");
    expect(head).toContain('property="og:locale" content="ja_JP"');
  });

  it.each(SEO_LANGUAGES)("outputs title, description, OGP, canonical and hreflang for %s", (language) => {
    const head = buildSeoHead(`/?lang=${language}`);
    expect(head).toContain(SEO_CONTENT[language].title);
    expect(head).toContain(SEO_CONTENT[language].description);
    expect(head).toContain(`property="og:locale" content="${SEO_CONTENT[language].locale}"`);
    expect(head).toContain(`rel="canonical" href="https://catacelo-btl-qxfrqdcy.manus.space/?lang=${language}"`);
    expect(head).toContain('hreflang="x-default"');
  });
});

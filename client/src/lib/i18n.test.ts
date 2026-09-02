import { afterEach, describe, expect, it } from "vitest";
import { initialLanguageSelection, languageFromCountry, LANGUAGES, translate } from "./i18n";

const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;

function installBrowser(search: string, savedLanguage: string | null) {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { search },
    localStorage: { getItem: () => savedLanguage },
  } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { language: "en-US", languages: ["en-US"] } });
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
});

describe("country language fallback", () => {
  it.each([
    ["JP", "ja"], ["FR", "fr"], ["MX", "es"], ["KR", "ko"], ["TW", "zh"], ["US", "en"],
  ] as const)("maps %s to %s", (country, language) => {
    expect(languageFromCountry(country)).toBe(language);
  });

  it("does not infer a language from an unavailable country code", () => {
    expect(languageFromCountry("XX")).toBeNull();
  });

  it("prioritizes an explicit URL language over a saved manual choice", () => {
    installBrowser("?lang=fr", "ja");
    expect(initialLanguageSelection()).toMatchObject({ language: "fr", reason: "url" });
  });

  it("uses the saved manual choice before browser inference", () => {
    installBrowser("", "ko");
    expect(initialLanguageSelection()).toMatchObject({ language: "ko", reason: "saved" });
  });

  it.each(LANGUAGES)("provides result-share controls in %s", ({ code }) => {
    expect(translate(code, "shareWithImage")).not.toBe("shareWithImage");
    expect(translate(code, "downloadImage")).not.toBe("downloadImage");
    expect(translate(code, "shareScore", { black: 36, white: 28 })).toContain("36");
  });
});

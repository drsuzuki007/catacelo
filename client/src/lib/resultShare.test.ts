import { describe, expect, it } from "vitest";
import { buildResultShareUrl, buildXShareUrl } from "./resultShare";

describe("result sharing links", () => {
  it("creates a language-linked battle URL without exposing a room code", () => {
    expect(buildResultShareUrl("https://example.test", "fr")).toBe("https://example.test/catacelo-battle.html?lang=fr");
  });

  it("encodes result text and the destination URL for an X share intent", () => {
    const intent = buildXShareUrl("Black wins · 36–28", "https://example.test/catacelo-battle.html?lang=en");
    expect(intent).toContain("twitter.com/intent/tweet?");
    expect(intent).toContain("text=Black+wins");
    expect(intent).toContain("url=https%3A%2F%2Fexample.test%2Fcatacelo-battle.html%3Flang%3Den");
  });
});

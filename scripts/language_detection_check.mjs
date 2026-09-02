import assert from "node:assert/strict";
import { languageFromCountry } from "../client/src/lib/i18n.ts";

const cases = [
  ["JP", "ja"], ["US", "en"], ["CN", "zh"], ["TW", "zh"],
  ["KR", "ko"], ["ES", "es"], ["MX", "es"], ["FR", "fr"], ["CA", "en"],
  ["DE", "en"], ["XX", null], [null, null],
];

for (const [country, expected] of cases) assert.equal(languageFromCountry(country), expected, `${country} should resolve to ${expected}`);
console.log(`language_detection_check: ${cases.length} country mappings passed`);

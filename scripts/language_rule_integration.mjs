import "dotenv/config";
import assert from "node:assert/strict";
import { appRouter } from "../server/routers.ts";

const countryCode = "ZZ";
const context = {
  user: { id: 1, openId: "language-rule-integration", name: "Integration", email: null, loginMethod: "system", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  req: { protocol: "https", headers: {} },
  res: {},
};
const caller = appRouter.createCaller(context);

let exitCode = 0;
try {
  await caller.languageRules.save({ countryCode, language: "fr" });
  const saved = await caller.languageRules.adminList();
  assert.equal(saved.find((rule) => rule.countryCode === countryCode)?.language, "fr");
  await caller.languageRules.remove({ countryCode });
  const afterRemoval = await caller.languageRules.adminList();
  assert.equal(afterRemoval.some((rule) => rule.countryCode === countryCode), false);
  console.log("language_rule_integration: save, list, remove passed");
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  await caller.languageRules.remove({ countryCode }).catch(() => undefined);
  process.exit(exitCode);
}

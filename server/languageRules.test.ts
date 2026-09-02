import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function nonAdminContext(): TrpcContext {
  return {
    user: { id: 7, openId: "regular-user", name: "Regular User", email: null, loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("language rule administration", () => {
  it("rejects a non-admin before any setting can be changed", async () => {
    const caller = appRouter.createCaller(nonAdminContext());
    await expect(caller.languageRules.save({ countryCode: "FR", language: "fr" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

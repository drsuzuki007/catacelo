import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { deleteLanguageCountryRule, listLanguageCountryRules, saveLanguageCountryRule } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";

const languageRuleInput = z.object({
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/).transform(value => value.toUpperCase()),
  language: z.enum(["ja", "en", "zh", "ko", "es", "fr"]),
});

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  languageRules: router({
    /** 利用者向けには国コードと表示言語だけを公開し、運用者情報は返さない。 */
    list: publicProcedure.query(async () => {
      const rows = await listLanguageCountryRules();
      return rows.map(({ countryCode, language }) => ({ countryCode, language }));
    }),
    adminList: adminProcedure.query(async () => listLanguageCountryRules()),
    save: adminProcedure.input(languageRuleInput).mutation(async ({ ctx, input }) => {
      await saveLanguageCountryRule(input.countryCode, input.language, ctx.user.openId);
      return { success: true } as const;
    }),
    remove: adminProcedure.input(z.object({ countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/).transform(value => value.toUpperCase()) })).mutation(async ({ input }) => {
      await deleteLanguageCountryRule(input.countryCode);
      return { success: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;

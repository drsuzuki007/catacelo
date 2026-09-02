import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });

async function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const explicit = await browser.newPage();
  await explicit.goto(`${baseUrl}/terms.html?lang=fr`, { waitUntil: "networkidle" });
  await assert(await explicit.locator("html").getAttribute("lang") === "fr", "URL指定のフランス語が適用されません。");
  await assert((await explicit.title()).includes("Catacelo") && (await explicit.title()) !== "利用規約 | Catacelo", "静的ページのフランス語タイトルが反映されません。");
  await assert((await explicit.locator('meta[name="description"]').getAttribute("content"))?.includes("Catacelo"), "静的ページのdescriptionが設定されません。");
  await assert(await explicit.locator('meta[property="og:description"]').count() === 1, "静的ページのOGP descriptionが設定されません。");
  await assert((await explicit.locator('link[rel="canonical"]').getAttribute("href"))?.endsWith("terms.html?lang=fr"), "静的ページのcanonicalが言語URLになりません。");
  await assert(await explicit.locator('link[rel="alternate"][hreflang]').count() === 7, "静的ページのhreflangが6言語と既定値で出力されません。");
  await explicit.locator('a[href^="privacy.html"]').first().click();
  await explicit.waitForURL(/privacy\.html\?lang=fr/);
  await assert(await explicit.locator("html").getAttribute("lang") === "fr", "ページ遷移後にURL言語が維持されません。");

  const savedContext = await browser.newContext();
  await savedContext.addInitScript(() => localStorage.setItem("catacelo_lang", "es"));
  const saved = await savedContext.newPage();
  await saved.goto(`${baseUrl}/terms.html`, { waitUntil: "networkidle" });
  await assert(await saved.locator("html").getAttribute("lang") === "es", "保存済みのスペイン語が適用されません。");
  await saved.locator('a[href^="privacy.html"]').first().click();
  await saved.waitForURL(/privacy\.html\?lang=es/);
  await assert((await saved.title()).includes("Catacelo") && (await saved.title()) !== "プライバシーポリシー | Catacelo", "保存済み言語のページタイトルが反映されません。");
  await assert((await saved.locator('link[rel="canonical"]').getAttribute("href"))?.endsWith("privacy.html?lang=es"), "保存済み言語の遷移先SEO canonicalが更新されません。");

  const step = await browser.newPage();
  await step.goto(`${baseUrl}/catacelostart.html?lang=en`, { waitUntil: "networkidle" });
  await assert((await step.locator("#catacelo-home-btn").getAttribute("href"))?.includes("lang=en"), "STEPページのトップ帰還リンクにURL言語が付与されません。");

  const titleChecks = [
    ["catacelostart.html?lang=en", "Catacelo"],
    ["catacelo-2pre.html?lang=zh", "Catacelo｜预读2步的AI（标准）"],
    ["catacelo-3pre.html?lang=ko", "Catacelo｜3수 앞을 읽는 AI (상급)"],
    ["terms.html?lang=es", "Términos de uso | Catacelo"],
    ["privacy.html?lang=fr", "Politique de confidentialité | Catacelo"],
    ["tokushoho.html?lang=en", "Commercial Transactions Act Notice | Catacelo"],
  ];
  for (const [path, expectedTitle] of titleChecks) {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/${path}`, { waitUntil: "networkidle" });
    await assert(await page.title() === expectedTitle, `${path} のタイトルが期待値と一致しません。`);
    await page.close();
  }

  console.log("Static language flow: passed");
} finally {
  await browser.close();
}

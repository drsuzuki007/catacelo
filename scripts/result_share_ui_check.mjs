import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(() => {
  window.__resultShareCheck = { native: null, xUrl: null };
  Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
  Object.defineProperty(navigator, "share", { configurable: true, value: async (data) => {
    window.__resultShareCheck.native = { title: data.title, text: data.text, url: data.url, file: data.files?.[0] ? { name: data.files[0].name, type: data.files[0].type, size: data.files[0].size } : null };
  } });
  window.open = (url) => { window.__resultShareCheck.xUrl = String(url); return null; };
});

function assert(condition, message) { if (!condition) throw new Error(message); }

try {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/catacelo-battle.html?lang=en`, { waitUntil: "networkidle" });
  const createdGame = await page.evaluate(async () => {
    const { supabase } = await import("/src/lib/supabase.ts");
    let { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) await supabase.auth.signInAnonymously();
    const nickname = `share${Date.now().toString().slice(-10)}`;
    const created = await supabase.schema("catacelo").rpc("create_room", { p_nickname: nickname });
    if (created.error || !created.data) throw new Error(created.error?.message || "Unable to create test room");
    return created.data;
  });
  const guestContext = await browser.newContext();
  try {
    const guestPage = await guestContext.newPage();
    await guestPage.goto(`${baseUrl}/catacelo-battle.html?lang=en`, { waitUntil: "networkidle" });
    await guestPage.evaluate(async (roomCode) => {
      const { supabase } = await import("/src/lib/supabase.ts");
      let { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) await supabase.auth.signInAnonymously();
      const joined = await supabase.schema("catacelo").rpc("join_room", { p_room_code: roomCode, p_nickname: "share-guest" });
      if (joined.error || !joined.data) throw new Error(joined.error?.message || "Unable to join test room");
    }, createdGame.room_code);
  } finally {
    await guestContext.close();
  }
  const room = await page.evaluate(async (game) => {
    const { supabase } = await import("/src/lib/supabase.ts");
    const resigned = await supabase.schema("catacelo").rpc("submit_move", {
      p_game_id: game.id, p_expected_move_number: game.move_count + 1, p_move_type: "resign",
      p_from_pos: null, p_to_pos: null, p_board_after: game.board_state,
    });
    if (resigned.error) throw new Error(resigned.error.message);
    return game.room_code;
  }, createdGame);

  await page.goto(`${baseUrl}/catacelo-battle.html?lang=en&room=${room}`, { waitUntil: "networkidle" });
  await page.locator(".result-share-dock").waitFor({ state: "visible" });
  await assert(await page.locator(".native-share-button").count() === 1, "画像付き共有ボタンが終局画面に表示されません。");
  await assert(await page.locator(".x-share-button").count() === 1, "X共有ボタンが終局画面に表示されません。");
  await assert(await page.locator(".download-share-button").count() === 1, "画像保存ボタンが終局画面に表示されません。");
  await page.screenshot({ path: "/tmp/catacelo-result-share-desktop.png", fullPage: true });

  await page.locator(".native-share-button").click();
  const nativeShare = await page.evaluate(() => window.__resultShareCheck.native);
  await assert(nativeShare?.file?.type === "image/png" && nativeShare.file.size > 5_000, "端末共有にPNG画像が渡されません。");
  await assert(nativeShare.text.includes("Black") && nativeShare.text.includes("White"), "端末共有に勝敗またはスコアが含まれません。");

  await page.locator(".x-share-button").click();
  const xUrl = await page.evaluate(() => window.__resultShareCheck.xUrl);
  await assert(xUrl?.startsWith("https://twitter.com/intent/tweet?") && xUrl.includes("catacelo-battle.html"), "X共有URLが正しく生成されません。");

  const download = page.waitForEvent("download");
  await page.locator(".download-share-button").click();
  const image = await download;
  await assert(image.suggestedFilename() === "catacelo-battle-result.png", "画像保存のファイル名が正しくありません。");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/catacelo-result-share-mobile.png", fullPage: true });
  await assert(await page.locator(".result-share-dock").isVisible(), "モバイル幅で共有パネルが表示されません。");
  console.log("Result share UI: passed", { room });
} finally {
  await context.close();
  await browser.close();
}

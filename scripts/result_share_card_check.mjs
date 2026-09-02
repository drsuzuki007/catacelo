import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${baseUrl}/catacelo-battle.html?lang=en`, { waitUntil: "networkidle" });
  const generated = await page.evaluate(async () => {
    const { createResultShareImage } = await import("/src/lib/resultShare.ts");
    const file = createResultShareImage({
      title: "Catacelo Battle",
      result: "Black wins",
      scoreLabel: "Black 36 — 28 White",
      blackLabel: "Black",
      whiteLabel: "White",
      blackScore: 36,
      whiteScore: 28,
      footer: "A remote match where pieces can move",
    });
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()).slice(0, 8));
    return { name: file.name, type: file.type, size: file.size, bytes };
  });
  if (generated.name !== "catacelo-battle-result.png" || generated.type !== "image/png" || generated.size < 5_000) throw new Error("共有PNGの形式またはサイズが不正です。");
  if (generated.bytes.join(",") !== "137,80,78,71,13,10,26,10") throw new Error("共有画像がPNG形式ではありません。");
  console.log("Result share card: passed", generated);
} finally {
  await browser.close();
}

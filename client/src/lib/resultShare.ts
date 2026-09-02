import type { Language } from "./i18n";

export type ResultShareCard = {
  title: string;
  result: string;
  scoreLabel: string;
  blackLabel: string;
  whiteLabel: string;
  blackScore: number;
  whiteScore: number;
  footer: string;
};

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

function shorten(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, encoded] = dataUrl.split(",");
  const match = /data:(.*?);base64/.exec(header);
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: match?.[1] ?? "image/png" });
}

/** 現在の勝敗を、送付先に依存せずPNGとして共有できる卓上カードへ描画する。 */
export function createResultShareImage(card: ResultShareCard): File {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Cannot create result share image.");

  const feltDeep = "#0E3B22";
  const felt = "#14522F";
  const gold = "#D9A441";
  const ivory = "#F6F1E3";
  const cell = "#1E8C3A";
  const wood = "#5A3921";

  const background = context.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  background.addColorStop(0, felt);
  background.addColorStop(1, feltDeep);
  context.fillStyle = background;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  context.strokeStyle = "rgba(246,241,227,.075)";
  context.lineWidth = 1;
  for (let position = 0; position <= CARD_WIDTH; position += 48) {
    context.beginPath(); context.moveTo(position, 0); context.lineTo(position, CARD_HEIGHT); context.stroke();
  }
  for (let position = 0; position <= CARD_HEIGHT; position += 48) {
    context.beginPath(); context.moveTo(0, position); context.lineTo(CARD_WIDTH, position); context.stroke();
  }

  context.strokeStyle = gold;
  context.lineWidth = 3;
  context.strokeRect(34, 34, CARD_WIDTH - 68, CARD_HEIGHT - 68);
  context.strokeStyle = "rgba(217,164,65,.42)";
  context.lineWidth = 1;
  context.strokeRect(46, 46, CARD_WIDTH - 92, CARD_HEIGHT - 92);

  const boardSize = 346;
  const boardX = 106;
  const boardY = 142;
  context.fillStyle = wood;
  context.fillRect(boardX - 15, boardY - 15, boardSize + 30, boardSize + 30);
  context.fillStyle = cell;
  context.fillRect(boardX, boardY, boardSize, boardSize);
  context.strokeStyle = "rgba(246,241,227,.26)";
  for (let position = 0; position <= 8; position += 1) {
    const offset = boardSize / 8 * position;
    context.beginPath(); context.moveTo(boardX + offset, boardY); context.lineTo(boardX + offset, boardY + boardSize); context.stroke();
    context.beginPath(); context.moveTo(boardX, boardY + offset); context.lineTo(boardX + boardSize, boardY + offset); context.stroke();
  }
  const disc = (x: number, y: number, color: "black" | "white") => {
    const gradient = context.createRadialGradient(x - 9, y - 10, 4, x, y, 32);
    if (color === "black") { gradient.addColorStop(0, "#84918b"); gradient.addColorStop(.34, "#29332f"); gradient.addColorStop(1, "#050807"); }
    else { gradient.addColorStop(0, "#ffffff"); gradient.addColorStop(.55, "#e9dfc8"); gradient.addColorStop(1, "#b8a98e"); }
    context.fillStyle = gradient;
    context.beginPath(); context.arc(x, y, 31, 0, Math.PI * 2); context.fill();
  };
  disc(boardX + 129, boardY + 130, "black"); disc(boardX + 216, boardY + 130, "white");
  disc(boardX + 129, boardY + 218, "white"); disc(boardX + 216, boardY + 218, "black");

  context.fillStyle = gold;
  context.font = "700 23px 'Noto Sans JP', sans-serif";
  context.letterSpacing = "4px";
  context.fillText(shorten(card.title.toUpperCase(), 26), 520, 128);
  context.letterSpacing = "0px";
  context.fillStyle = ivory;
  context.font = "800 51px 'Noto Sans JP', sans-serif";
  context.fillText(shorten(card.result, 22), 520, 205);
  context.fillStyle = "rgba(246,241,227,.76)";
  context.font = "600 20px 'Noto Sans JP', sans-serif";
  context.fillText(shorten(card.scoreLabel, 32), 520, 255);

  context.fillStyle = "rgba(0,0,0,.18)";
  context.fillRect(520, 286, 548, 126);
  context.strokeStyle = "rgba(217,164,65,.6)";
  context.strokeRect(520, 286, 548, 126);
  disc(571, 348, "black"); disc(840, 348, "white");
  context.fillStyle = ivory;
  context.font = "700 20px 'Noto Sans JP', sans-serif";
  context.fillText(shorten(card.blackLabel, 12), 618, 330);
  context.fillText(shorten(card.whiteLabel, 12), 887, 330);
  context.font = "900 57px 'Noto Sans JP', sans-serif";
  context.fillText(String(card.blackScore), 621, 387);
  context.fillText(String(card.whiteScore), 890, 387);
  context.fillStyle = "rgba(246,241,227,.68)";
  context.font = "600 18px 'Noto Sans JP', sans-serif";
  context.fillText(shorten(card.footer, 48), 520, 475);
  context.fillStyle = gold;
  context.font = "800 18px 'Noto Sans JP', sans-serif";
  context.fillText("CATACELO BATTLE", 520, 535);

  return new File([dataUrlToBlob(canvas.toDataURL("image/png"))], "catacelo-battle-result.png", { type: "image/png" });
}

export function buildResultShareUrl(currentPageUrl: string, language: Language): string {
  const url = new URL("catacelo-battle.html", currentPageUrl);
  url.searchParams.set("lang", language);
  return url.toString();
}

export function buildXShareUrl(text: string, url: string): string {
  const parameters = new URLSearchParams({ text, url });
  return `https://twitter.com/intent/tweet?${parameters.toString()}`;
}

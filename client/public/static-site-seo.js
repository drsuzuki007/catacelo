/* 静的STEP・規約ページ共通。catacelo_lang / ?lang= の現在値をHTMLヘッドへ反映する。 */
(function () {
  var supported = ["ja", "en", "zh", "ko", "es", "fr"];
  var language = new URLSearchParams(location.search).get("lang");
  if (supported.indexOf(language) < 0) {
    try { language = localStorage.getItem("catacelo_lang"); } catch (_) { language = null; }
  }
  if (supported.indexOf(language) < 0) language = "ja";
  var descriptions = {
    ja: "Catacelo — 駒を動かす新しいオセロ。遊び方、オンライン対戦、利用規約をご案内します。",
    en: "Catacelo — an Othello variant with piece movement. Guides, online play, and policies.",
    zh: "Catacelo — 加入棋子移动规则的全新奥赛罗。游戏指南、在线对战与相关条款。",
    ko: "Catacelo — 말 이동 규칙을 더한 새로운 오델로. 게임 가이드, 온라인 대국 및 약관.",
    es: "Catacelo: una nueva variante de Othello con movimiento de fichas. Guía, juego en línea y políticas.",
    fr: "Catacelo : une variante d’Othello avec déplacement des pions. Guide, jeu en ligne et politiques.",
  };
  function upsert(selector, tag, attributes) {
    var node = document.head.querySelector(selector);
    if (!node) { node = document.createElement(tag); document.head.appendChild(node); }
    Object.keys(attributes).forEach(function (key) { node.setAttribute(key, attributes[key]); });
  }
  document.documentElement.lang = language;
  var canonical = location.origin + location.pathname + "?lang=" + language;
  upsert('meta[name="description"]', "meta", { name: "description", content: descriptions[language] });
  upsert('meta[property="og:title"]', "meta", { property: "og:title", content: document.title });
  upsert('meta[property="og:description"]', "meta", { property: "og:description", content: descriptions[language] });
  upsert('meta[property="og:type"]', "meta", { property: "og:type", content: "website" });
  upsert('link[rel="canonical"]', "link", { rel: "canonical", href: canonical });
  supported.forEach(function (code) {
    upsert('link[rel="alternate"][hreflang="' + code + '"]', "link", { rel: "alternate", hreflang: code, href: location.origin + location.pathname + "?lang=" + code });
  });
  upsert('link[rel="alternate"][hreflang="x-default"]', "link", { rel: "alternate", hreflang: "x-default", href: location.origin + location.pathname + "?lang=ja" });
}());

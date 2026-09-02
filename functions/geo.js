/**
 * Cloudflare Pages Function: CDNが付与する国コードだけを返す。
 * Cloudflare以外ではクライアント側のブラウザ言語・タイムゾーン推定へ自動フォールバックする。
 */
export async function onRequestGet({ request }) {
  const headerCountry = request.headers.get("CF-IPCountry") || "XX";
  const country = /^[A-Z]{2}$/.test(headerCountry.toUpperCase()) ? headerCountry.toUpperCase() : "XX";
  return new Response(JSON.stringify({ country }), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

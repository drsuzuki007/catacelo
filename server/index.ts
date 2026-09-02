import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  /** CDNの国コードヘッダーを、静的クライアントが安全に読める最小JSONへ変換する。 */
  app.get("/geo", (req, res) => {
    const candidate = String(req.headers["cf-ipcountry"] ?? req.headers["x-country-code"] ?? "XX").toUpperCase();
    const country = /^[A-Z]{2}$/.test(candidate) ? candidate : "XX";
    res.setHeader("Cache-Control", "no-store");
    res.json({ country });
  });

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);

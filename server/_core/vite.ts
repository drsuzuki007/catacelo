import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { buildSeoHead } from "../seo";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  const serveHtml = async (req: express.Request, res: express.Response, next: express.NextFunction, requestedHtml: "index.html" | "catacelo-battle.html") => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        requestedHtml
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(/src="\/src\/(main|battle-main)\.tsx"/, (_match, entry) => `src="/src/${entry}.tsx?v=${nanoid()}"`);
      const page = (await vite.transformIndexHtml(url, template)).replace("<!--seo-head-->", () => buildSeoHead(url));
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  };

  // ViteのSPAフォールバックより先に、STEP 2専用のHTMLエントリを明示する。
  app.get("/catacelo-battle.html", (req, res, next) => serveHtml(req, res, next, "catacelo-battle.html"));
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    await serveHtml(req, res, next, "index.html");
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath, { index: false }));

  // fall through to index.html if the file doesn't exist
  app.use("*", async (req, res, next) => {
    try {
      const template = await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
      res.status(200).set({ "Content-Type": "text/html" }).end(template.replace("<!--seo-head-->", () => buildSeoHead(req.originalUrl)));
    } catch (error) {
      next(error);
    }
  });
}

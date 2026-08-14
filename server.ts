import crypto from "crypto";
import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { fetchRatesData, getCachedRates, updateCache } from "./api/rates";
import { fetchNewsData } from "./api/news";
import { getSettings, saveSettings } from "./api/settings";
import jwt from "jsonwebtoken";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-for-dev";
  const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918";

  const authenticateToken = (req: Request, res: Response, next: any) => {
    const token = req.cookies.adminToken || req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      jwt.verify(token, JWT_SECRET);
      next();
    } catch (err) {
      return res.status(403).json({ error: "Invalid token" });
    }
  };

  app.post("/api/admin/login", (req: Request, res: Response) => {
    const { password } = req.body;
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    if (hash === ADMIN_PASSWORD_HASH || password === process.env.ADMIN_PASSWORD) {
      const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '12h' });
      res.cookie('adminToken', token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: 'strict', maxAge: 12 * 3600 * 1000 });
      return res.json({ success: true, token });
    }
    return res.status(401).json({ error: "Invalid password" });
  });

  app.post("/api/admin/settings", authenticateToken, async (req: Request, res: Response) => {
    try {
      await saveSettings(req.body);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to save settings" });
    }
  });

  app.get("/api/rates", async (req: Request, res: Response) => {
    const settings = await getSettings();
    const rates = await getCachedRates();
    return res.json({ ...rates, settings });
  });

  app.get("/api/cron/fetch", async (req: Request, res: Response) => {
    await updateCache();
    return res.json({ success: true });
  });

  app.get("/api/news", async (req: Request, res: Response) => {
    const newsData = await fetchNewsData();
    return res.json(newsData);
  });

  setInterval(updateCache, 30000);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

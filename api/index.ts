import express, { Request, Response } from "express";
import cors from "cors";
import { fetchRatesData } from "./rates";
import { fetchNewsData } from "./news";

const app = express();

app.use(cors());
app.use(express.json());

// УниверсальныйCatch-All обработчик, защищающий от ошибок путей Vercel Rewrite
app.all("*", async (req: Request, res: Response) => {
  const url = req.url || "";

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (url.includes("news")) {
    const newsData = await fetchNewsData();
    return res.json(newsData);
  }

  // По умолчанию возвращаем курсы валют
  const ratesData = await fetchRatesData();
  return res.json(ratesData);
});

if (process.env.NODE_ENV !== "production") {
  app.listen(3001, () => {
    console.log(`[Dev Server] Server running on http://localhost:3001`);
  });
}

export default app;

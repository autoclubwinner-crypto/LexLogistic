import express from "express";
import cors from "cors";
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json());

const commonHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Cache-Control': 'no-cache',
};

// ЛОВИМ АБСОЛЮТНО ВСЕ ЗАПРОСЫ (защита от "обрезания" путей Vercel)
app.all('*', async (req, res) => {
  
  // 1. ЕСЛИ ЗАПРОСИЛИ НОВОСТИ (Проверяем URL на наличие слова news)
  if (req.url.includes('news')) {
    const rssSources = [
      "https://rssexport.rbc.ru/rbcnews/news/30/full.rss",
      "https://www.kommersant.ru/RSS/news.xml",
      "https://lenta.ru/rss/news/economics"
    ];
    const results: Record<string, string | null> = {};
    
    await Promise.allSettled(rssSources.map(async (source) => {
        try {
            const fetchRes = await axios.get(source, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
            results[source] = fetchRes.status === 200 ? fetchRes.data : null;
        } catch(e) {
            results[source] = null;
        }
    }));
    return res.json(results);
  }

  // 2. ЕСЛИ ЗАПРОСИЛИ КУРСЫ ВАЛЮТ (Для всех остальных запросов)
  try {
    let cgRes: any = null;
    let garantexRes: any = null;
    let fallbackRes: any = null;

    // Делаем 3 запроса одновременно, ждем максимум 4.5 секунды
    await Promise.allSettled([
      axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=rub,eur', { timeout: 4500 }).then(r => cgRes = r).catch(() => {}),
      axios.get('https://garantex.org/api/v2/depth?market=usdtrub', { headers: commonHeaders, timeout: 4500 }).then(r => garantexRes = r).catch(() => {}),
      axios.get('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', { timeout: 4500 }).then(r => fallbackRes = r).catch(() => {})
    ]);

    let usdtRubRaw = 0;
    let xeEur = 0;

    // Шаг 1: Берем базу из железобетонного банковского API (если другие лежат)
    if (fallbackRes?.data?.usd) {
        xeEur = fallbackRes.data.usd.eur;
        usdtRubRaw = fallbackRes.data.usd.rub * 1.052; // +5.2% наценка рынка
    }

    // Шаг 2: Перезаписываем точными данными из CoinGecko (Евро и Рубль)
    if (cgRes?.data?.tether) {
        if (cgRes.data.tether.rub) usdtRubRaw = cgRes.data.tether.rub;
        if (cgRes.data.tether.eur) xeEur = cgRes.data.tether.eur;
    }

    // Шаг 3: Рубль перезаписываем точнейшей биржей Garantex (самый важный курс)
    if (garantexRes?.data?.asks?.length > 0) {
        usdtRubRaw = parseFloat(garantexRes.data.asks[0].price);
    }

    // Финальная проверка на нули (чтобы сайт точно не сломался)
    if (!usdtRubRaw || usdtRubRaw === 0) usdtRubRaw = 95.50;
    if (!xeEur || xeEur === 0) xeEur = 0.92;

    return res.json({ usdtRubRaw, xeEur });
  } catch (e) {
    console.error("Critical API Error:", e);
    // При жестком сбое отдаем запасные цифры
    return res.status(500).json({ error: "Failed", usdtRubRaw: 95.50, xeEur: 0.92 });
  }
});

// Запуск для локальной разработки
if (process.env.NODE_ENV !== "production") {
    app.listen(3001, () => console.log(`Dev server on 3001`));
}

export default app;

import express from "express";
import cors from "cors";
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json());

// Главный роут курсов
app.get(["/api/rates", "/rates"], async (req, res) => {
  try {
    let usdtRubRaw = 0;
    let xeEur = 0;

    // 1. CoinGecko API (Не блокирует дата-центры Vercel, дает 100% точный крипто-курс)
    try {
        const cgRes = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=rub,eur', { timeout: 5000 });
        if (cgRes.data?.tether?.rub) usdtRubRaw = cgRes.data.tether.rub;
        if (cgRes.data?.tether?.eur) xeEur = cgRes.data.tether.eur;
    } catch (e) {
        console.error("CoinGecko Error:", e.message);
    }

    // 2. Garantex Fallback (На случай, если CoinGecko лежит)
    if (usdtRubRaw === 0) {
        try {
            const garantexRes = await axios.get('https://garantex.org/api/v2/depth?market=usdtrub', { timeout: 4000 });
            if (garantexRes.data?.asks?.length > 0) {
                usdtRubRaw = parseFloat(garantexRes.data.asks[0].price);
            }
        } catch (e) {}
    }

    // 3. Железобетонный CDN Fallback (Если легла вся крипта, берем обычный валютный курс)
    if (usdtRubRaw === 0 || xeEur === 0) {
        try {
            const fallback = await axios.get('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', { timeout: 4000 });
            if (xeEur === 0 && fallback.data?.usd?.eur) xeEur = fallback.data.usd.eur;
            if (usdtRubRaw === 0 && fallback.data?.usd?.rub) usdtRubRaw = fallback.data.usd.rub * 1.052; // Накидываем 5.2% премию крипты
        } catch (e) {}
    }

    // 4. Последняя линия защиты (чтобы не было нулей)
    if (!usdtRubRaw || usdtRubRaw === 0) usdtRubRaw = 95.50;
    if (!xeEur || xeEur === 0) xeEur = 0.92;

    res.json({ usdtRubRaw, xeEur });
  } catch (e) {
    res.status(500).json({ error: "Failed", usdtRubRaw: 95.50, xeEur: 0.92 });
  }
});

// Роут новостей
app.get(["/api/news", "/news"], async (req, res) => {
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
    res.json(results);
});

// Запуск для локальной среды
if (process.env.NODE_ENV !== "production") {
    app.listen(3001, () => console.log(`Dev server on 3001`));
}

export default app;

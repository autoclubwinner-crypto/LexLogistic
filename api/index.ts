import express from "express";
import cors from "cors";
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json());

// Заголовки для обхода Cloudflare
const commonHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
};

// Главный роут курсов
app.get(["/api/rates", "/rates"], async (req, res) => {
  try {
    let rapiraRes: any = null;
    let garantexRes: any = null;
    let xeRes: any = null;

    // Запускаем запросы параллельно. Используем новый безотказный CDN fallback.
    await Promise.allSettled([
      axios.get('https://api.rapira.net/market/exchange-plate-mini?symbol=USDT/RUB', { headers: commonHeaders, timeout: 5000 }).then(r => rapiraRes = r).catch(e => console.error("Rapira Error:", e.message)),
      axios.get('https://garantex.org/api/v2/depth?market=usdtrub', { headers: commonHeaders, timeout: 5000 }).then(r => garantexRes = r).catch(e => console.error("Garantex Error:", e.message)),
      axios.get('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', { headers: commonHeaders, timeout: 5000 }).then(r => xeRes = r).catch(e => console.error("Fallback Error:", e.message))
    ]);

    let usdtRubRaw = 0;
    let xeEur = 0;

    // 1. Пытаемся получить курс Rapira
    if (rapiraRes?.status === 200 && rapiraRes.data?.ask?.items?.length > 0) {
        const items = rapiraRes.data.ask.items;
        usdtRubRaw = parseFloat(items.length > 11 ? items[11].price : items[items.length - 1].price);
    }

    // 2. Если Rapira легла, берем Garantex
    if (usdtRubRaw === 0 && garantexRes?.status === 200 && garantexRes.data?.asks?.length > 0) {
        usdtRubRaw = parseFloat(garantexRes.data.asks[0].price);
    }

    // 3. Достаем курс EUR/USD и фоллбэк для рубля
    if (xeRes?.status === 200) {
      const data = xeRes.data;
      if (data?.usd?.eur) xeEur = data.usd.eur;
      if (usdtRubRaw === 0 && data?.usd?.rub) usdtRubRaw = data.usd.rub * 1.052; // Фоллбэк: курс + 5.2%
    }
    
    // 4. ЖЕЛЕЗОБЕТОННАЯ ЗАЩИТА: Если все биржи мира одновременно легли
    if (!usdtRubRaw || usdtRubRaw === 0) usdtRubRaw = 95.50;
    if (!xeEur || xeEur === 0) xeEur = 0.92;

    res.json({ usdtRubRaw, xeEur });
  } catch (e) {
    console.error("Critical API Error:", e);
    // Даже при жестком краше отдаем цифры, чтобы сайт не сломался
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

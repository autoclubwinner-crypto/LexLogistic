import express from "express";
import cors from "cors";
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json());

// Функция для обхода Cloudflare блокировок Vercel через AllOrigins
async function fetchViaProxy(targetUrl: string): Promise<string | null> {
    try {
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
        const response = await axios.get(proxyUrl, { timeout: 8000 });
        if (response.data && response.data.contents) {
            return response.data.contents;
        }
        return null;
    } catch (error: any) {
        console.error(`Proxy fetch failed for ${targetUrl}:`, error.message);
        return null;
    }
}

app.all(["/api/rates", "/rates"], async (req, res) => {
  try {
    let usdtRubRaw = 0;
    let xeEur = 0;

    let rapiraStr: string | null = null;
    let garantexStr: string | null = null;
    let fallbackRes: any = null;

    // Делаем 3 запроса одновременно
    await Promise.allSettled([
      fetchViaProxy('https://api.rapira.net/market/exchange-plate-mini?symbol=USDT/RUB').then(r => rapiraStr = r),
      fetchViaProxy('https://garantex.org/api/v2/depth?market=usdtrub').then(r => garantexStr = r),
      axios.get('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', { timeout: 5000 }).then(r => fallbackRes = r).catch(() => {})
    ]);

    // 1. Jsdelivr (Железобетонный банковский API)
    if (fallbackRes?.data?.usd) {
        if (fallbackRes.data.usd.eur) xeEur = fallbackRes.data.usd.eur;
        if (fallbackRes.data.usd.rub) usdtRubRaw = fallbackRes.data.usd.rub * 1.052; // Фоллбэк с 5.2% наценкой
    }

    // 2. Rapira (Через прокси)
    if (rapiraStr) {
        try {
            const rapiraData = JSON.parse(rapiraStr);
            if (rapiraData?.ask?.items && Array.isArray(rapiraData.ask.items) && rapiraData.ask.items.length > 0) {
                const items = rapiraData.ask.items;
                usdtRubRaw = parseFloat(items.length > 11 ? items[11].price : items[items.length - 1].price);
            }
        } catch (e: any) {
            console.error("Rapira parse error:", e.message);
        }
    }

    // 3. Garantex (Через прокси - приоритет, перезаписывает Rapira если есть)
    if (garantexStr) {
        try {
            const garantexData = JSON.parse(garantexStr);
            if (garantexData?.asks?.length > 0) {
                usdtRubRaw = parseFloat(garantexData.asks[0].price);
            }
        } catch (e: any) {
            console.error("Garantex parse error:", e.message);
        }
    }

    // 4. Финальная защита (хардкод, чтобы не было нулей)
    if (!usdtRubRaw || usdtRubRaw === 0) usdtRubRaw = 95.50;
    if (!xeEur || xeEur === 0) xeEur = 0.92;

    return res.json({ usdtRubRaw, xeEur });
  } catch (e: any) {
    console.error("Critical Rates Error:", e.message);
    return res.status(500).json({ error: "Failed", usdtRubRaw: 95.50, xeEur: 0.92 });
  }
});

app.all(["/api/news", "/news"], async (req, res) => {
    const rssSources = [
      "https://rssexport.rbc.ru/rbcnews/news/30/full.rss",
      "https://www.kommersant.ru/RSS/news.xml",
      "https://lenta.ru/rss/news/economics"
    ];
    
    const results: Record<string, string | null> = {};
    
    await Promise.allSettled(rssSources.map(async (source) => {
        const contents = await fetchViaProxy(source);
        results[source] = contents;
    }));
    
    return res.json(results);
});

if (process.env.NODE_ENV !== "production") {
    app.listen(3001, () => console.log(`Dev server on 3001`));
}

export default app;

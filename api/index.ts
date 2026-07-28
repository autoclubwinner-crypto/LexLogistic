import express from "express";
import cors from "cors";
import axios from "axios";

const app = express();
app.use(cors());

// Proxy endpoint for rates (Rapira and XE)
app.get("/api/rates", async (req, res) => {
  try {
    let rapiraRes: any = null;
    let xeRes: any = null;
    
    await Promise.allSettled([
      axios.post('https://api.rapira.net/market/exchange-plate-mini?symbol=USDT/RUB', {}, {
          headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*',
              'Origin': 'https://rapira.net',
              'Referer': 'https://rapira.net/',
              'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
          },
          timeout: 8000
      }).then(r => rapiraRes = r).catch(e => { console.error("Rapira axios error", e.message); }),
      
      axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 8000 })
        .then(r => xeRes = r).catch(e => { console.error("XE axios error", e.message); })
    ]);

    let usdtRubRaw = 0;
    let xeEur = 0;

    if (rapiraRes && rapiraRes.status === 200) {
      try {
        const rapiraPlate = rapiraRes.data;
        if(rapiraPlate?.ask?.items && Array.isArray(rapiraPlate.ask.items)) {
          const items = rapiraPlate.ask.items;
          if (items.length > 11) {
            usdtRubRaw = parseFloat(items[11].price);
          } else if (items.length > 0) {
            usdtRubRaw = parseFloat(items[items.length - 1].price);
          }
        }
      } catch (err) {
        console.error("Rapira data parse error:", err);
      }
    }

    if (xeRes && xeRes.status === 200) {
      try {
          const data = xeRes.data;
          if (data?.rates?.EUR) {
              xeEur = data.rates.EUR;
          }
          if (usdtRubRaw === 0 && data?.rates?.RUB) {
              // Fallback if Rapira is blocked by Cloudflare on Vercel
              usdtRubRaw = data.rates.RUB * 1.052; 
          }
      } catch(e) {
          console.error("Parse er-api error", e);
      }
    }
    
    res.json({ usdtRubRaw, xeEur });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch rates" });
  }
});

// Proxy endpoint for news RSS
app.get("/api/news", async (req, res) => {
    const rssSources = [
      "https://rssexport.rbc.ru/rbcnews/news/30/full.rss",
      "https://www.kommersant.ru/RSS/news.xml",
      "https://lenta.ru/rss/news/economics"
    ];

    const results: Record<string, string | null> = {};
    
    await Promise.allSettled(rssSources.map(async (source) => {
        try {
            const fetchRes = await fetch(source, {
              headers: {
                  'User-Agent': 'Mozilla/5.0'
              }
            });
            if(fetchRes.ok) {
                results[source] = await fetchRes.text();
            } else {
                results[source] = null;
            }
        } catch(e) {
            results[source] = null;
        }
    }));

    res.json(results);
});

if (process.env.NODE_ENV !== "production") {
    // В локальной среде запускаем бэкенд на порту 3001
    const PORT = 3001;
    app.listen(PORT, () => {
        console.log(`Development backend server running on http://localhost:${PORT}`);
    });
}

export default app;
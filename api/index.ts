import express from "express";
import cors from "cors";
import axios from "axios";

const app = express();
app.use(cors());

// Proxy endpoint for rates (Rapira, Garantex, and XE)
app.get("/api/rates", async (req, res) => {
  try {
    let rapiraRes: any = null;
    let garantexRes: any = null;
    let xeRes: any = null;

    const commonHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    };

    await Promise.allSettled([
      // 1. Rapira API (Strictly GET as requested)
      axios.get('https://api.rapira.net/market/exchange-plate-mini?symbol=USDT/RUB', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          },
          timeout: 5000
      }).then(r => rapiraRes = r).catch(e => console.error("Rapira fetch error:", e.message)),
      
      // 2. Garantex API (Strictly GET)
      axios.get('https://garantex.org/api/v2/depth?market=usdtrub', {
          headers: commonHeaders,
          timeout: 5000
      }).then(r => garantexRes = r).catch(e => console.error("Garantex fetch error:", e.message)),
      
      // 3. Central Bank / Forex fallback (er-api)
      axios.get('https://open.er-api.com/v6/latest/USD', { 
          headers: commonHeaders,
          timeout: 5000 
      }).then(r => xeRes = r).catch(e => console.error("XE fetch error:", e.message))
    ]);

    let usdtRubRaw = 0;
    let xeEur = 0;

    // Parse Rapira Data
    if (rapiraRes && rapiraRes.status === 200) {
      try {
        const rapiraPlate = rapiraRes.data;
        if (rapiraPlate?.ask?.items && Array.isArray(rapiraPlate.ask.items)) {
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

    // Fallback to Garantex if Rapira failed or returned 0
    if (usdtRubRaw === 0 && garantexRes && garantexRes.status === 200) {
        try {
            const garantexData = garantexRes.data;
            if (garantexData?.asks && Array.isArray(garantexData.asks) && garantexData.asks.length > 0) {
                usdtRubRaw = parseFloat(garantexData.asks[0].price);
            }
        } catch (err) {
            console.error("Garantex data parse error:", err);
        }
    }

    // Parse ER-API Data (XE Euro Cross-Rate + Ultimate Fallback for RUB)
    if (xeRes && xeRes.status === 200) {
      try {
          const data = xeRes.data;
          if (data?.rates?.EUR) {
              xeEur = data.rates.EUR;
          }
          // Ultimate fallback for RUB if both crypto exchanges fail
          if (usdtRubRaw === 0 && data?.rates?.RUB) {
              usdtRubRaw = data.rates.RUB * 1.052; // Add 5.2% premium to forex rate as crypto proxy
          }
      } catch(e) {
          console.error("Parse er-api error:", e);
      }
    }
    
    // Ensure we send numbers back, even if 0
    res.json({ usdtRubRaw: usdtRubRaw || 0, xeEur: xeEur || 0 });
  } catch (e) {
    console.error("Critical error in /api/rates:", e);
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
            const fetchRes = await axios.get(source, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              timeout: 5000
            });
            if(fetchRes.status === 200) {
                results[source] = fetchRes.data;
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
    const PORT = 3001;
    app.listen(PORT, () => {
        console.log(`Development backend server running on http://localhost:${PORT}`);
    });
}

export default app;

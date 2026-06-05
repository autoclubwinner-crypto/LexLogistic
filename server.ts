import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());

  // Proxy endpoint for rates (Rapira and XE)
  app.get("/api/rates", async (req, res) => {
    try {
      const [rapiraRes, xeRes] = await Promise.allSettled([
        fetch('https://api.rapira.net/market/exchange-plate-mini?symbol=USDT/RUB', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'application/json'
            }
        }),
        fetch('https://www.xe.com/currencyconverter/convert/?Amount=1&From=USD&To=EUR', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'text/html,application/xhtml+xml,application/xml'
            }
        })
      ]);

      let usdtRubRaw = 0;
      let xeEur = 0;

      if (rapiraRes.status === 'fulfilled' && rapiraRes.value.ok) {
        const rapiraPlate = await rapiraRes.value.json() as any;
        if(rapiraPlate?.ask?.items && Array.isArray(rapiraPlate.ask.items)) {
          const items = rapiraPlate.ask.items;
          if (items.length > 11) {
            usdtRubRaw = parseFloat(items[11].price);
          } else if (items.length > 0) {
            usdtRubRaw = parseFloat(items[items.length - 1].price);
          }
        }
      }

      if (xeRes.status === 'fulfilled' && xeRes.value.ok) {
        const text = await xeRes.value.text();
        const match = text.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
        if (match) {
          try {
            const data = JSON.parse(match[1]);
            xeEur = data.props.pageProps.initialRatesData.rates.EUR;
          } catch (e) {
            console.error("Failed to parse XE data", e);
          }
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

      const results = {};
      
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

  // Vite middleware for development
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

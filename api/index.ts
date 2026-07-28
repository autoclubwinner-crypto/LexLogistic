import express, { Request, Response } from "express";
import cors from "cors";
import axios from "axios";

const app = express();

app.use(cors());
app.use(express.json());

// Структура кеша в памяти для предотвращения бана по Rate Limit
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

let ratesCache: CacheEntry<{ usdtRubRaw: number; xeEur: number }> | null = null;
const CACHE_TTL_MS = 30000; // Кеш на 30 секунд

// Актуальный браузёрный User-Agent для прохождения базовых проверок WAF
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/**
 * Безопасный фетчер JSON с таймаутом и заголовками браузера
 */
async function safeFetchJson<T>(url: string, timeout = 6000): Promise<T | null> {
  try {
    const response = await axios.get<T>(url, {
      timeout,
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
      },
    });
    return response.data;
  } catch (error: any) {
    console.warn(`[API Fetch Warning] Source failed ${url}: ${error.message}`);
    return null;
  }
}

/**
 * Маршрут получения курсов валют (/api/rates)
 */
app.all(["/api/rates", "/rates"], async (req: Request, res: Response) => {
  const now = Date.now();

  // Возврат данных из кеша, если они свежие
  if (ratesCache && now - ratesCache.timestamp < CACHE_TTL_MS) {
    return res.json(ratesCache.data);
  }

  let usdtRubRaw = 0;
  let xeEur = 0;

  try {
    // Параллельный опрос источников
    const [rapiraData, erData, backupData] = await Promise.all([
      safeFetchJson<any>("https://api.rapira.net/market/exchange-plate-mini?symbol=USDT/RUB"),
      safeFetchJson<any>("https://open.er-api.com/v6/latest/USD"),
      safeFetchJson<any>(
        "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
      ),
    ]);

    // 1. Обработка Rapira (Основной источник USDT/RUB)
    if (
      rapiraData?.ask?.items &&
      Array.isArray(rapiraData.ask.items) &&
      rapiraData.ask.items.length > 0
    ) {
      const items = rapiraData.ask.items;
      const targetItem = items.length > 11 ? items[11] : items[items.length - 1];
      if (targetItem?.price) {
        const parsed = parseFloat(targetItem.price);
        if (!isNaN(parsed) && parsed > 0) {
          usdtRubRaw = parsed;
        }
      }
    }

    // 2. Обработка ExchangeRate-API (Основной источник USD/EUR)
    if (erData?.rates?.EUR) {
      const parsedEur = parseFloat(erData.rates.EUR);
      if (!isNaN(parsedEur) && parsedEur > 0) {
        xeEur = parsedEur;
      }
    }

    // 3. Резервный источник FawazAhmed API (Если один из основных источников недоступен)
    if (backupData?.usd) {
      if (!xeEur && backupData.usd.eur) {
        xeEur = parseFloat(backupData.usd.eur);
      }
      if (!usdtRubRaw && backupData.usd.rub) {
        // Расчёт ориентировочного USDT/RUB с наценкой P2P рынка (+2.5%)
        usdtRubRaw = parseFloat(backupData.usd.rub) * 1.025;
      }
    }

    // 4. Гарантированный фоллбэк при полном отсутствии сети
    if (!usdtRubRaw || isNaN(usdtRubRaw)) usdtRubRaw = 95.5;
    if (!xeEur || isNaN(xeEur)) xeEur = 0.92;

    const finalResult = { usdtRubRaw, xeEur };

    // Обновление кеша
    ratesCache = { data: finalResult, timestamp: now };

    return res.json(finalResult);
  } catch (e: any) {
    console.error("Critical Rates Route Error:", e.message);
    return res.status(200).json({ usdtRubRaw: 95.5, xeEur: 0.92 });
  }
});

/**
 * Маршрут получения новостей (/api/news)
 */
app.all(["/api/news", "/news"], async (req: Request, res: Response) => {
  const rssSources = [
    "https://rssexport.rbc.ru/rbcnews/news/30/full.rss",
    "https://www.kommersant.ru/RSS/news.xml",
    "https://lenta.ru/rss/news/economics",
  ];

  const results: Record<string, string | null> = {};

  await Promise.allSettled(
    rssSources.map(async (source) => {
      try {
        const response = await axios.get(source, {
          timeout: 7000,
          headers: {
            "User-Agent": BROWSER_USER_AGENT,
            Accept: "application/rss+xml, application/xml, text/xml, */*",
          },
          responseType: "text",
        });
        results[source] = typeof response.data === "string" ? response.data : null;
      } catch (e: any) {
        console.warn(`RSS Feed Fetch Failed (${source}):`, e.message);
        results[source] = null;
      }
    })
  );

  return res.json(results);
});

// Запуск локального сервера разработки
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`[Dev Server] Server running on http://localhost:${PORT}`);
  });
}

export default app;


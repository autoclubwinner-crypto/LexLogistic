import crypto from "crypto";
import express, { Request, Response } from "express";
import cors from "cors";
// @ts-ignore
import cookieParser from "cookie-parser";
// @ts-ignore
import jwt from "jsonwebtoken";
import axios from "axios";

// ==========================================
// UPSTASH DATABASE LOGIC
// ==========================================
const BASE_URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const localCache = new Map<string, string>();

async function command<T = unknown>(cmd: (string | number)[]): Promise<T> {
  if (!BASE_URL || !TOKEN) {
    const action = cmd[0];
    const key = String(cmd[1]);
    if (action === 'GET') return (localCache.get(key) || null) as T;
    if (action === 'SET') {
      localCache.set(key, String(cmd[2]));
      return 'OK' as T;
    }
    return null as any;
  }
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { result: T };
  return json.result;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await command<string | null>(['GET', key]);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (e) {
    return null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    await command(['SET', key, JSON.stringify(value)]);
  } catch (e) {
    // ignore
  }
}

// ==========================================
// SETTINGS LOGIC
// ==========================================
export interface AdminSettings {
  usdtTblPercent: number;
  usdtSwiftPercent: number;
  eurUsdCrossPercent: number;
  eurUsdCrossAdd: number;
  usdtBaseOverride: string;
  eurBaseOverride: string;
}

const defaultSettings: AdminSettings = {
  usdtTblPercent: 1.3,
  usdtSwiftPercent: 1.0,
  eurUsdCrossPercent: 0.3,
  eurUsdCrossAdd: 0.002,
  usdtBaseOverride: '',
  eurBaseOverride: ''
};

export async function getSettings(): Promise<AdminSettings> {
  const settings = await kvGet<AdminSettings>('rex:settings');
  return settings ?? defaultSettings;
}

export async function saveSettings(settings: AdminSettings): Promise<void> {
  const current = await getSettings();
  await kvSet('rex:settings', { ...current, ...settings });
}

// ==========================================
// RATES COLLECTOR LOGIC
// ==========================================
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export async function updateCache() {
  const settings = await getSettings();
  let usdtRubRaw = 0;
  let xeEur = 0;
  let sourceUsed = "";

  if (settings.usdtBaseOverride && !isNaN(parseFloat(settings.usdtBaseOverride))) {
    usdtRubRaw = parseFloat(settings.usdtBaseOverride);
    sourceUsed = "manual-override";
  }
  if (settings.eurBaseOverride && !isNaN(parseFloat(settings.eurBaseOverride))) {
    xeEur = parseFloat(settings.eurBaseOverride);
  }

  const sourcesMap: Record<string, number | null> = {
    rapiraDepth: null,
    rapiraOpen: null,
    bybitSpot: null,
    htx: null,
    coinbase: null,
    coinpaprika: null,
    fawaz: null,
    cbrPlus: null,
    erApiPlus: null
  };

  let rapiraDepthMeta: any = null;

  try {
    const workerHeaders: Record<string, string> = {
      "User-Agent": BROWSER_UA,
      "Accept": "application/json"
    };
    if (process.env.WORKER_SECRET) {
      workerHeaders["x-worker-secret"] = process.env.WORKER_SECRET;
    }

    const parseDepthBook = (data: any) => {
      if (!data?.ask?.items || !Array.isArray(data.ask.items)) return null;
      let sorted = data.ask.items
        .map((i: any) => parseFloat(i.price))
        .filter((p: number) => !isNaN(p) && p > 50)
        .sort((a: number, b: number) => a - b);
        
      if (sorted.length === 0) return null;
      
      let n = sorted.length;
      let bestAsk = sorted[0];
      
      // Берем 3-ю строчку с самого верха стакана (самые высокие цены).
      // Визуальный виджет сжимает 24 строки в 12, поэтому 3-я строка сверху в виджете
      // почти всегда соответствует 3-й строке с конца в сыром массиве (n - 3).
      let pickedIndex = Math.max(0, n - 3);
      let picked = sorted[pickedIndex];
      
      return { n, bestAsk, top1: sorted[n-1], top2: n > 1 ? sorted[n-2] : sorted[n-1], top3: picked, pickedIndex };
    };

    const [
      htxRes, rapiraOpenRes, rapiraDepthRes, bybitRes,
      coinbaseRes, paprikaRes, fawazRes, cbrRes, erRes
    ] = await Promise.allSettled([
      axios.get("https://otc-api.htx.com/v1/data/trade-market?coinId=2&currency=11&tradeType=sell&currPage=1&payMethod=0&acceptOrder=0&blockType=general&online=1&range=0&amount=50000", { timeout: 4000, headers: { "User-Agent": BROWSER_UA } }),
      axios.get("https://dry-rice-d2fc.autoclubwinner.workers.dev/open", { timeout: 4000, headers: workerHeaders }),
      axios.post("https://dry-rice-d2fc.autoclubwinner.workers.dev/depth", "", { timeout: 4000, headers: workerHeaders }),
      axios.get("https://api.bybit.com/v5/market/tickers?category=spot&symbol=USDTRUB", { timeout: 4000, headers: { Accept: "application/json" } }),
      axios.get("https://api.coinbase.com/v2/exchange-rates?currency=USDT", { timeout: 4000 }),
      axios.get("https://api.coinpaprika.com/v1/tickers/usdt-tether?quotes=RUB", { timeout: 4000 }),
      axios.get("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usdt.json", { timeout: 4000 }),
      axios.get("https://www.cbr-xml-daily.ru/daily_json.js", { timeout: 4000, headers: { "User-Agent": BROWSER_UA } }),
      axios.get("https://open.er-api.com/v6/latest/USD", { timeout: 4000, headers: { "User-Agent": BROWSER_UA } })
    ]);

    if (rapiraDepthRes.status === "fulfilled") {
      let meta = parseDepthBook(rapiraDepthRes.value?.data);
      
      // Fallback: Если мини-стакан урезан - запрашиваем полный
      if (meta && (meta.n < 8 || (meta.top1 - meta.bestAsk) < 0.5)) {
        try {
          const fullRes = await axios.post("https://dry-rice-d2fc.autoclubwinner.workers.dev/depth-full", "", { timeout: 4000, headers: workerHeaders });
          const fullMeta = parseDepthBook(fullRes.data);
          if (fullMeta) meta = fullMeta;
        } catch (e) {
          // Игнорируем ошибку, продолжаем с mini-стаканом
        }
      }

      if (meta) {
        sourcesMap.rapiraDepth = meta.top3;
        rapiraDepthMeta = meta;
      }
    }

    if (rapiraOpenRes.status === "fulfilled") {
      const rawData = rapiraOpenRes.value?.data;
      const list = Array.isArray(rawData) ? rawData : (Array.isArray(rawData?.data) ? rawData.data : []);
      const symbolData = list.find((s: any) => s.symbol === "USDT/RUB");
      if (symbolData) {
        const p = parseFloat(symbolData.askPrice || symbolData.close || symbolData.last);
        if (!isNaN(p) && p > 50) sourcesMap.rapiraOpen = p;
      }
    }

    if (bybitRes.status === "fulfilled" && bybitRes.value?.data?.retCode === 0 && bybitRes.value?.data?.result?.list?.length > 0) {
      const ticker = bybitRes.value.data.result.list[0];
      const p = parseFloat(ticker.ask1Price || ticker.lastPrice);
      if (!isNaN(p) && p > 50) sourcesMap.bybitSpot = p;
    }

    if (htxRes.status === "fulfilled" && htxRes.value?.data?.data) {
      const items = htxRes.value.data.data;
      if (Array.isArray(items) && items.length > 0 && items[0].price) {
        const p = parseFloat(items[0].price);
        if (!isNaN(p) && p > 50) sourcesMap.htx = p;
      }
    }

    if (coinbaseRes.status === "fulfilled" && coinbaseRes.value?.data?.data?.rates?.RUB) {
      const p = parseFloat(coinbaseRes.value.data.data.rates.RUB);
      if (!isNaN(p) && p > 50) sourcesMap.coinbase = p;
    }

    if (paprikaRes.status === "fulfilled" && paprikaRes.value?.data?.quotes?.RUB?.price) {
      const p = parseFloat(paprikaRes.value.data.quotes.RUB.price);
      if (!isNaN(p) && p > 50) sourcesMap.coinpaprika = p;
    }

    if (fawazRes.status === "fulfilled" && fawazRes.value?.data?.usdt?.rub) {
      const p = parseFloat(fawazRes.value.data.usdt.rub);
      if (!isNaN(p) && p > 50) sourcesMap.fawaz = p;
    }

    if (cbrRes.status === "fulfilled" && cbrRes.value?.data?.Valute) {
      const valute = cbrRes.value.data.Valute;
      if (valute.USD?.Value) {
        const p = parseFloat(valute.USD.Value) * 1.025;
        if (!isNaN(p) && p > 50) sourcesMap.cbrPlus = p;
      }
      if (!xeEur && valute.EUR?.Value && valute.USD?.Value) {
        xeEur = valute.USD.Value / valute.EUR.Value;
      }
    }

    if (erRes.status === "fulfilled" && erRes.value?.data?.rates) {
      const rates = erRes.value.data.rates;
      if (rates.RUB) {
        const p = parseFloat(rates.RUB) * 1.025;
        if (!isNaN(p) && p > 50) sourcesMap.erApiPlus = p;
      }
      if (!xeEur && rates.EUR && !isNaN(parseFloat(rates.EUR))) {
        xeEur = parseFloat(rates.EUR);
      }
    }
  } catch (e) {
    // Ignore global errors
  }

  if (!usdtRubRaw) {
    if (sourcesMap.rapiraDepth && sourcesMap.rapiraDepth > 50) {
      usdtRubRaw = sourcesMap.rapiraDepth;
      sourceUsed = "Rapira (Depth)";
    } else if (sourcesMap.rapiraOpen && sourcesMap.rapiraOpen > 50) {
      usdtRubRaw = sourcesMap.rapiraOpen;
      sourceUsed = "Rapira (Open Market)";
    } else if (sourcesMap.bybitSpot && sourcesMap.bybitSpot > 50) {
      usdtRubRaw = sourcesMap.bybitSpot;
      sourceUsed = "Bybit Spot";
    } else if (sourcesMap.htx && sourcesMap.htx > 50) {
      usdtRubRaw = sourcesMap.htx;
      sourceUsed = "HTX P2P";
    } else if (sourcesMap.coinbase && sourcesMap.coinbase > 50) {
      usdtRubRaw = sourcesMap.coinbase;
      sourceUsed = "Coinbase";
    } else if (sourcesMap.coinpaprika && sourcesMap.coinpaprika > 50) {
      usdtRubRaw = sourcesMap.coinpaprika;
      sourceUsed = "CoinPaprika";
    } else if (sourcesMap.fawaz && sourcesMap.fawaz > 50) {
      usdtRubRaw = sourcesMap.fawaz;
      sourceUsed = "Fawaz Currency API";
    } else if (sourcesMap.cbrPlus && sourcesMap.cbrPlus > 50) {
      usdtRubRaw = sourcesMap.cbrPlus;
      sourceUsed = "CBR + 2.5%";
    } else if (sourcesMap.erApiPlus && sourcesMap.erApiPlus > 50) {
      usdtRubRaw = sourcesMap.erApiPlus;
      sourceUsed = "ER-API + 2.5%";
    }
  }

  let success = true;
  if (!usdtRubRaw || isNaN(usdtRubRaw) || usdtRubRaw <= 0) {
    usdtRubRaw = 85.3;
    success = false;
  }
  
  if (!xeEur || isNaN(xeEur) || xeEur <= 0) {
    xeEur = 0.856; 
  }

  const payload: any = {
    usdtRubRaw: Number(usdtRubRaw.toFixed(4)),
    xeEur: Number(xeEur.toFixed(6)),
    timestamp: Date.now(),
    success,
    sourceUsed,
    sources: sourcesMap
  };

  if (rapiraDepthMeta) {
    payload.rapiraDepthMeta = rapiraDepthMeta;
  }

  await kvSet('rex:rates:latest', payload);
  return payload;
}

export async function getCachedRates() {
  const cachedData = await kvGet<any>('rex:rates:latest');
  if (cachedData) return cachedData;
  return { 
    usdtRubRaw: 85.3, 
    xeEur: 0.856, 
    timestamp: Date.now(), 
    success: false, 
    sources: {} 
  };
}

// ==========================================
// NEWS LOGIC
// ==========================================
export async function fetchNewsData(): Promise<Record<string, string | null>> {
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
          timeout: 4000,
          headers: {
            "User-Agent": BROWSER_UA,
            Accept: "application/rss+xml, application/xml, text/xml, */*",
          },
          responseType: "text",
        });
        results[source] = typeof response.data === "string" ? response.data : null;
      } catch (e: any) {
        results[source] = null;
      }
    })
  );
  return results;
}

// ==========================================
// EXPRESS ROUTER
// ==========================================
const app = express();
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

const checkCronAuth = (req: Request) => {
  const bearer = req.headers.authorization;
  if (bearer && process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (req.query.secret && process.env.CRON_SECRET && req.query.secret === process.env.CRON_SECRET) return true;
  if (req.headers['x-collector-secret'] && req.headers['x-collector-secret'] === process.env.COLLECTOR_SECRET) return true;
  return false;
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
  res.setHeader('Cache-Control', 'no-store');
  const settings = await getSettings();
  const rates = await getCachedRates();
  return res.json({ ...rates, settings });
});

app.get("/api/cron/fetch", async (req: Request, res: Response) => {
  if (!checkCronAuth(req)) return res.status(401).json({ error: 'unauthorized' });
  const result = await updateCache();
  return res.json(result);
});

app.get("/api/collector", async (req: Request, res: Response) => {
  if (!checkCronAuth(req)) return res.status(401).json({ error: 'unauthorized' });
  const result = await updateCache();
  return res.status(200).json(result);
});

app.get("/api/news", async (req: Request, res: Response) => {
  const newsData = await fetchNewsData();
  return res.json(newsData);
});

export default app;

import { getSettings } from "./settings";
import axios from "axios";
import fs from "fs";
import path from "path";

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const IS_VERCEL = process.env.VERCEL === "1";
const CACHE_FILE = IS_VERCEL ? "/tmp/ratesCache.json" : path.join(process.cwd(), ".data", "ratesCache.json");

let memoryCache: any = {
  usdtRubRaw: 0,
  xeEur: 0,
  timestamp: 0,
  success: false
};
let fallbackStreak = 0;

export async function updateCache() {
  let usdtRubRaw = 0;
  let xeEur = 0;
  let sourceUsed = "";

  try {
    const [rapiraDepthRes, rapiraOpenRes, bybitRes, cbrRes, erRes, fawazRes] = await Promise.allSettled([
      // 1. Original Rapira (Depth)
      axios.get("https://api.rapira.net/market/exchange-plate-mini?symbol=USDT/RUB", {
        timeout: 3000,
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      }),
      // 2. Rapira Open Market Rates
      axios.get("https://api.rapira.net/open/market/rates", {
        timeout: 3000,
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      }),
      // 3. Bybit P2P OTC API (works well on Vercel as a crypto alternative)
      axios.post("https://api2.bybit.com/fiat/otc/item/online", {
        userId: "", tokenId: "USDT", currencyId: "RUB", payment: [], side: "1", size: "10", page: "1", amount: "50000"
      }, { timeout: 3500 }),
      // 4. CBR
      axios.get("https://www.cbr-xml-daily.ru/daily_json.js", {
        timeout: 3000,
        headers: { "User-Agent": BROWSER_UA },
      }),
      // 5. ER-API
      axios.get("https://open.er-api.com/v6/latest/USD", {
        timeout: 3000,
        headers: { "User-Agent": BROWSER_UA },
      }),
      // 6. Fawaz
      axios.get(
        "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
        { timeout: 3000 }
      ),
    ]);

    // 1. Rapira API (Depth)
    if (rapiraDepthRes.status === "fulfilled" && rapiraDepthRes.value?.data?.ask?.items) {
      const items = rapiraDepthRes.value.data.ask.items;
      if (Array.isArray(items) && items.length > 0) {
        const item = items.length > 11 ? items[11] : items[items.length - 1];
        if (item?.price) {
          const depthAsk = parseFloat(item.price);
          if (!isNaN(depthAsk) && depthAsk > 50) {
            usdtRubRaw = depthAsk;
            sourceUsed = "Rapira (Depth 12th row)";
          }
        }
      }
    }

    // 2. Rapira Open Market Rates
    if (!usdtRubRaw && rapiraOpenRes.status === "fulfilled") {
      const rawData = rapiraOpenRes.value?.data;
      const list = Array.isArray(rawData) ? rawData : (Array.isArray(rawData?.data) ? rawData.data : []);
      const symbolData = list.find((s: any) => s.symbol === "USDT/RUB");
      if (symbolData) {
        const openAsk = parseFloat(symbolData.askPrice || symbolData.close || symbolData.last);
        if (!isNaN(openAsk) && openAsk > 50) {
          usdtRubRaw = openAsk;
          sourceUsed = "Rapira (Open Market)";
        }
      }
    }

    // 3. Bybit P2P (Working Vercel Alternative)
    if (!usdtRubRaw && bybitRes.status === "fulfilled" && bybitRes.value?.data?.result?.items) {
       const items = bybitRes.value.data.result.items;
       if (items.length > 0 && items[0].price) {
          const bybitPrice = parseFloat(items[0].price);
          if (!isNaN(bybitPrice) && bybitPrice > 50) {
             usdtRubRaw = bybitPrice;
             sourceUsed = "Bybit P2P";
          }
       }
    }

    // 4. CBR
    if (!usdtRubRaw && cbrRes.status === "fulfilled" && cbrRes.value?.data?.Valute) {
      const valute = cbrRes.value.data.Valute;
      if (valute.USD?.Value) {
        usdtRubRaw = parseFloat(valute.USD.Value) * 1.025;
        sourceUsed = "CBR + 2.5%";
      }
      if (!xeEur && valute.EUR?.Value && valute.USD?.Value) {
        xeEur = valute.USD.Value / valute.EUR.Value;
      }
    }

    // 4. ER-API
    if (erRes.status === "fulfilled" && erRes.value?.data?.rates) {
      const rates = erRes.value.data.rates;
      if (!xeEur && rates.EUR && !isNaN(rates.EUR)) {
        xeEur = parseFloat(rates.EUR);
      }
      if (!usdtRubRaw && rates.RUB && !isNaN(rates.RUB)) {
        usdtRubRaw = parseFloat(rates.RUB) * 1.025;
        if (!sourceUsed) sourceUsed = "ER-API + 2.5%";
      }
    }

    // 5. Fawaz
    if (fawazRes.status === "fulfilled" && fawazRes.value?.data?.usd) {
      const usd = fawazRes.value.data.usd;
      if (!xeEur && usd.eur) xeEur = parseFloat(usd.eur);
      if (!usdtRubRaw && usd.rub) {
        usdtRubRaw = parseFloat(usd.rub) * 1.025;
        if (!sourceUsed) sourceUsed = "Fawaz + 2.5%";
      }
    }
  } catch (e) {
    console.error("Error in updateCache fetch:", e);
  }

  let success = true;

  if (!usdtRubRaw || isNaN(usdtRubRaw) || usdtRubRaw <= 0) {
    usdtRubRaw = memoryCache.usdtRubRaw || 87.50;
    success = false;
  }

  if (!xeEur || isNaN(xeEur) || xeEur <= 0) {
    xeEur = memoryCache.xeEur || 0.92;
    success = false;
  }

  const finalData = {
    usdtRubRaw: Number(usdtRubRaw.toFixed(4)),
    xeEur: Number(xeEur.toFixed(6)),
    timestamp: Date.now(),
    success: true
  };

  memoryCache = finalData;
  try {
    if (!fs.existsSync(path.dirname(CACHE_FILE))) {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(finalData, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to persist rates cache:", e);
  }

  return finalData;
}

const CACHE_MAX_AGE_MS = 3 * 60 * 1000; // 3 minutes

export async function getCachedRates() {
  let cachedData: any = null;

  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, "utf-8");
      cachedData = JSON.parse(data);
    }
  } catch (e) {
    console.error("Failed to read ratesCache.json", e);
  }

  const now = Date.now();
  const isFresh = cachedData &&
    cachedData.success &&
    cachedData.usdtRubRaw > 80 &&
    cachedData.timestamp &&
    (now - cachedData.timestamp < CACHE_MAX_AGE_MS);

  if (isFresh) {
    return cachedData;
  }

  try {
    return await updateCache();
  } catch (e) {
    console.error("Error updating cache in getCachedRates:", e);
  }

  if (memoryCache && memoryCache.usdtRubRaw > 80) {
    return memoryCache;
  }

  return cachedData || {
    usdtRubRaw: 87.50,
    xeEur: 0.92,
    timestamp: Date.now(),
    success: true
  };
}

export async function fetchRatesData() {
  return await getCachedRates();
}

// Handler for Vercel Serverless Function /api/rates
export default async function handler(req: any, res: any) {
  try {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();

    const data: any = await getCachedRates();
    const settings = await getSettings();
    return res.status(200).json({ ...data, settings });
  } catch (error: any) {
    console.error("Vercel rates handler error:", error);
    return res.status(200).json({
      usdtRubRaw: 87.50,
      xeEur: 0.92,
      timestamp: Date.now(),
      success: true,
      settings: {
        usdtTblPercent: 1.3,
        usdtSwiftPercent: 1.0,
        eurUsdCrossPercent: 0.3,
        eurUsdCrossAdd: 0.002,
        usdtBaseOverride: '',
        eurBaseOverride: ''
      }
    });
  }
}


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
  success: false
};
let fallbackStreak = 0;

export async function updateCache() {
  let usdtRubRaw = 0;
  let xeEur = 0;
  let sourceUsed = "";

  const [rapiraDepthRes, rapiraOpenRes, cbrRes, erRes, fawazRes, bybitRes] = await Promise.allSettled([
    // Original Rapira
    axios.get("https://api.rapira.net/market/exchange-plate-mini?symbol=USDT/RUB", {
      timeout: 3500,
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
    }),
    // New Rapira (for comparison)
    axios.get("https://api.rapira.net/open/market/rates", {
      timeout: 3500,
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
    }),
    // CBR
    axios.get("https://www.cbr-xml-daily.ru/daily_json.js", {
      timeout: 3500,
      headers: { "User-Agent": BROWSER_UA },
    }),
    // ER-API
    axios.get("https://open.er-api.com/v6/latest/USD", {
      timeout: 3500,
      headers: { "User-Agent": BROWSER_UA },
    }),
    // Fawaz
    axios.get(
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
      { timeout: 3500 }
    ),
    // Bybit P2P
    axios.post("https://api2.bybit.com/fiat/otc/item/online", {
      userId: "", tokenId: "USDT", currencyId: "RUB", payment: [], side: "1", size: "10", page: "1", amount: "50000", authMaker: false, canTrade: false
    }, {
      timeout: 3500,
      headers: { "User-Agent": BROWSER_UA, "Content-Type": "application/json" }
    })
  ]);

  // Log Rapira Open vs Depth for P1.6 comparison
  let depthAsk = 0;
  let openAsk = 0;

  // 1. Rapira API (Depth)
  if (rapiraDepthRes.status === "fulfilled" && rapiraDepthRes.value?.data?.ask?.items) {
    const items = rapiraDepthRes.value.data.ask.items;
    if (Array.isArray(items) && items.length > 0) {
      const item = items.length > 11 ? items[11] : items[items.length - 1];
      if (item?.price) {
        depthAsk = parseFloat(item.price);
        if (!isNaN(depthAsk) && depthAsk > 0) {
          usdtRubRaw = depthAsk;
          sourceUsed = "Rapira (Depth 12th row)";
        }
      }
    }
  }

  // Check new open API
  if (rapiraOpenRes.status === "fulfilled" && Array.isArray(rapiraOpenRes.value?.data)) {
    const symbolData = rapiraOpenRes.value.data.find((s: any) => s.symbol === "USDT/RUB");
    if (symbolData?.askPrice) {
      openAsk = parseFloat(symbolData.askPrice);
    }
  }
  
  if (depthAsk > 0 || openAsk > 0) {
    console.log(`[RAPIRA COMPARISON] Depth 12th row: ${depthAsk}, Open API askPrice: ${openAsk}`);
  }

  // 1.5 Bybit P2P
  if (!usdtRubRaw && bybitRes.status === "fulfilled") {
    try {
      const result = bybitRes.value?.data?.result;
      if (!result || !result.items || !Array.isArray(result.items)) {
        console.warn("[BYBIT WARNING] Unexpected Bybit API response structure:", JSON.stringify(bybitRes.value?.data).substring(0, 200));
      } else if (result.items.length > 0 && result.items[0]?.price) {
        const val = parseFloat(result.items[0].price);
        if (!isNaN(val) && val > 0) {
          usdtRubRaw = val;
          sourceUsed = "Bybit P2P";
        }
      }
    } catch (e: any) {
      console.warn("[BYBIT WARNING] Error parsing Bybit P2P response:", e.message);
    }
  }

  // 3. CBR
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

  let success = true;

  // Track fallbacks
  if (sourceUsed.includes("CBR") || sourceUsed.includes("ER-API") || sourceUsed.includes("Fawaz")) {
    fallbackStreak++;
    if (fallbackStreak >= 2) {
      console.error(`[ALERT] High-quality sources failing! Fallback streak: ${fallbackStreak}. Current source: ${sourceUsed}`);
    }
  } else if (sourceUsed === "") {
    fallbackStreak++;
    console.error(`[ALERT] ALL SOURCES FAILED! Fallback streak: ${fallbackStreak}`);
  } else {
    fallbackStreak = 0; // reset
  }
  
  if (sourceUsed) {
    console.log(`[RATES] Successfully fetched rates using: ${sourceUsed}`);
  }

  // 6. Hard fallback (using last known good from memory or static)
  if (!usdtRubRaw || isNaN(usdtRubRaw) || usdtRubRaw <= 0) {
    usdtRubRaw = memoryCache.usdtRubRaw || 95.50;
    success = false;
  }

  if (!xeEur || isNaN(xeEur) || xeEur <= 0) {
    xeEur = memoryCache.xeEur || 0.92;
    success = false;
  }

  const finalData = {
    usdtRubRaw: Number(usdtRubRaw.toFixed(4)),
    xeEur: Number(xeEur.toFixed(6)),
    success
  };

  if (success) {
    memoryCache = finalData;
    // Persist to file
    try {
      if (!fs.existsSync(path.dirname(CACHE_FILE))) {
        fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      }
      fs.writeFileSync(CACHE_FILE, JSON.stringify(finalData, null, 2), "utf-8");
      
    } catch (e) {
      console.error("Failed to persist rates cache:", e);
    }
  }
}

export async function getCachedRates() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Failed to read ratesCache.json", e);
  }
  
  if (!memoryCache.success || memoryCache.usdtRubRaw === 0) {
    console.log("[RATES] Cache empty, fetching synchronously...");
    await updateCache();
  }
  
  return memoryCache;
}

// Ensure first fetch runs immediately
setTimeout(updateCache, 1000);

export async function fetchRatesData() {
  return await getCachedRates();
}

// For direct vercel endpoint routing if needed
export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  
  try {
    const data: any = await getCachedRates();
    const settings = await getSettings();
    return res.status(200).json({ ...data, settings });
  } catch (error: any) {
    return res.status(200).json({ usdtRubRaw: 95.50, xeEur: 0.92, success: false });
  }
}

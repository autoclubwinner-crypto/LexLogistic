import { kvGet, kvSet } from './lib/upstash';
import { getSettings } from './settings';
import type { AdminSettings } from './settings';
import axios from 'axios';

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

  try {
    const [rapiraOpenRes, rapiraDepthRes, bybitRes, cbrRes, erRes] = await Promise.allSettled([
      axios.get("https://api.rapira.net/open/market/rates", {
        timeout: 3000,
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      }),
      axios.post("https://api.rapira.net/market/exchange-plate-mini", new URLSearchParams({ symbol: "USDT/RUB" }), {
        timeout: 3000,
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      }),
      axios.post("https://api2.bybit.com/fiat/otc/item/online", {
        userId: "", tokenId: "USDT", currencyId: "RUB", payment: [], side: "1", size: "10", page: "1", amount: "50000"
      }, { timeout: 3500 }),
      axios.get("https://www.cbr-xml-daily.ru/daily_json.js", {
        timeout: 3000,
        headers: { "User-Agent": BROWSER_UA },
      }),
      axios.get("https://open.er-api.com/v6/latest/USD", {
        timeout: 3000,
        headers: { "User-Agent": BROWSER_UA },
      })
    ]);

    // 1. Rapira Open Market
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

    // 2. Rapira Depth
    if (!usdtRubRaw && rapiraDepthRes.status === "fulfilled" && rapiraDepthRes.value?.data?.ask?.items) {
      const items = rapiraDepthRes.value.data.ask.items;
      if (Array.isArray(items) && items.length > 0) {
        const item = items.length > 11 ? items[11] : items[items.length - 1];
        if (item?.price) {
          const depthAsk = parseFloat(item.price);
          if (!isNaN(depthAsk) && depthAsk > 50) {
            usdtRubRaw = depthAsk;
            sourceUsed = "Rapira (Depth)";
          }
        }
      }
    }

    // 3. Bybit P2P
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

    // 4. CBR / Форекс
    let valute: any = null;
    if (cbrRes.status === "fulfilled" && cbrRes.value?.data?.Valute) {
      valute = cbrRes.value.data.Valute;
      if (!usdtRubRaw && valute.USD?.Value) {
        usdtRubRaw = parseFloat(valute.USD.Value) * 1.025;
        sourceUsed = "CBR + 2.5%";
      }
      if (!xeEur && valute.EUR?.Value && valute.USD?.Value) {
        xeEur = valute.USD.Value / valute.EUR.Value;
      }
    }

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
  } catch (e) {
    console.error("Collector fetch error:", e);
  }

  let success = true;
  if (!usdtRubRaw || isNaN(usdtRubRaw) || usdtRubRaw <= 0) {
    usdtRubRaw = 85.3;
    success = false;
  }
  if (!xeEur || isNaN(xeEur) || xeEur <= 0) {
    xeEur = 0.856;
    success = false;
  }

  const payload = {
    usdtRubRaw: Number(usdtRubRaw.toFixed(4)),
    xeEur: Number(xeEur.toFixed(6)),
    timestamp: Date.now(),
    success,
    sourceUsed
  };

  await kvSet('rex:rates:latest', payload);
  return payload;
}

function isAuthorized(req: any): boolean {
  const bearer = req.headers.authorization;
  if (bearer && process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (req.headers['x-collector-secret'] === process.env.COLLECTOR_SECRET) return true;
  return false;
}

export default async function handler(req: any, res: any) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'unauthorized' });
  const result = await updateCache();
  return res.status(200).json(result);
}

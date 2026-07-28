import axios from "axios";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export async function fetchRatesData(): Promise<{ usdtRubRaw: number; xeEur: number; success: boolean }> {
  let usdtRubRaw = 0;
  let xeEur = 0;

  // Параллельный опрос всех основных и альтернативных источников (Таймаут 3.5 сек)
  const [rapiraRes, garantexRes, cbrRes, erRes, fawazRes] = await Promise.allSettled([
    axios.get("https://api.rapira.net/market/exchange-plate-mini?symbol=USDT/RUB", {
      timeout: 3500,
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
    }),
    axios.get("https://garantex.org/api/v2/depth?market=usdtrub", {
      timeout: 3500,
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
    }),
    axios.get("https://www.cbr-xml-daily.ru/daily_json.js", {
      timeout: 3500,
      headers: { "User-Agent": BROWSER_UA },
    }),
    axios.get("https://open.er-api.com/v6/latest/USD", {
      timeout: 3500,
      headers: { "User-Agent": BROWSER_UA },
    }),
    axios.get(
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
      { timeout: 3500 }
    ),
  ]);

  // 1. Источник: Rapira API
  if (rapiraRes.status === "fulfilled" && rapiraRes.value?.data?.ask?.items) {
    const items = rapiraRes.value.data.ask.items;
    if (Array.isArray(items) && items.length > 0) {
      const item = items.length > 11 ? items[11] : items[items.length - 1];
      if (item?.price) {
        const val = parseFloat(item.price);
        if (!isNaN(val) && val > 0) usdtRubRaw = val;
      }
    }
  }

  // 2. Источник: Garantex API (приоритет над Rapira при наличии)
  if (garantexRes.status === "fulfilled" && garantexRes.value?.data?.asks) {
    const asks = garantexRes.value.data.asks;
    if (Array.isArray(asks) && asks.length > 0 && asks[0]?.price) {
      const val = parseFloat(asks[0].price);
      if (!isNaN(val) && val > 0) usdtRubRaw = val;
    }
  }

  // 3. Альтернативный источник: Центробанк РФ (CBR API) + P2P Маржа
  if (!usdtRubRaw && cbrRes.status === "fulfilled" && cbrRes.value?.data?.Valute) {
    const valute = cbrRes.value.data.Valute;
    if (valute.USD?.Value) {
      // Курс ЦБ РФ + ~2.5% средняя наценка USDT P2P
      usdtRubRaw = parseFloat(valute.USD.Value) * 1.025;
    }
    if (!xeEur && valute.EUR?.Value && valute.USD?.Value) {
      xeEur = valute.USD.Value / valute.EUR.Value;
    }
  }

  // 4. Альтернативный источник: Open ExchangeRate-API
  if (erRes.status === "fulfilled" && erRes.value?.data?.rates) {
    const rates = erRes.value.data.rates;
    if (!xeEur && rates.EUR && !isNaN(rates.EUR)) {
      xeEur = parseFloat(rates.EUR);
    }
    if (!usdtRubRaw && rates.RUB && !isNaN(rates.RUB)) {
      usdtRubRaw = parseFloat(rates.RUB) * 1.025;
    }
  }

  // 5. Альтернативный источник: FawazAhmed CDN API
  if (fawazRes.status === "fulfilled" && fawazRes.value?.data?.usd) {
    const usd = fawazRes.value.data.usd;
    if (!xeEur && usd.eur) xeEur = parseFloat(usd.eur);
    if (!usdtRubRaw && usd.rub) usdtRubRaw = parseFloat(usd.rub) * 1.025;
  }

  let success = true;
  // 6. Гарантированный безопасный фоллбэк (Никогда не отдавать 0 или NaN)
  if (!usdtRubRaw || isNaN(usdtRubRaw) || usdtRubRaw <= 0) {
    usdtRubRaw = 95.50;
    success = false;
  }
  if (!xeEur || isNaN(xeEur) || xeEur <= 0) {
    xeEur = 0.92;
    success = false;
  }

  return {
    usdtRubRaw: Number(usdtRubRaw.toFixed(4)),
    xeEur: Number(xeEur.toFixed(6)),
    success
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const data = await fetchRatesData();
    return res.status(200).json(data);
  } catch (error: any) {
    return res.status(200).json({ usdtRubRaw: 95.50, xeEur: 0.92, success: false });
  }
}

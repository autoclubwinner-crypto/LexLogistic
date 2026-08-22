import { kvGet } from "./lib/upstash";
import { getSettings } from "./settings";
import { updateCache as runCollector } from "./collector";

export async function getCachedRates() {
  const cachedData = await kvGet<any>('rex:rates:latest');
  if (cachedData && cachedData.success) {
    return cachedData;
  }
  // Fallback if cache is missing
  return {
    usdtRubRaw: 85.3,
    xeEur: 0.856,
    timestamp: Date.now(),
    success: false
  };
}

export async function updateCache() {
  return await runCollector();
}

export async function fetchRatesData() {
  return await getCachedRates();
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const data: any = await getCachedRates();
  const settings = await getSettings();
  return res.status(200).json({ ...data, settings });
}


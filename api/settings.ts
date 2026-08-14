import fs from "fs";
import path from "path";

// Vercel KV fallback to local file
const SETTINGS_FILE = path.join(process.cwd(), ".data", "settings.json");

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
  if (process.env.KV_REST_API_URL) {
    try {
      const { kv } = await import("@vercel/kv");
      const data = await kv.get("adminSettings");
      if (data) return data as AdminSettings;
    } catch (e) {
      console.error("Failed to read from KV", e);
    }
  }

  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Failed to read settings.json", e);
  }
  
  return defaultSettings;
}

export async function saveSettings(settings: AdminSettings): Promise<void> {
  if (process.env.KV_REST_API_URL) {
    try {
      const { kv } = await import("@vercel/kv");
      await kv.set("adminSettings", settings);
    } catch (e) {
      console.error("Failed to write to KV", e);
    }
  }

  try {
    if (!fs.existsSync(path.dirname(SETTINGS_FILE))) {
      fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to write settings.json", e);
  }
}

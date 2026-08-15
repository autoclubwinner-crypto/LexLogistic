import fs from "fs";
import path from "path";

const IS_VERCEL = process.env.VERCEL === "1";
const SETTINGS_FILE = IS_VERCEL ? "/tmp/settings.json" : path.join(process.cwd(), ".data", "settings.json");

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
  try {
    if (!fs.existsSync(path.dirname(SETTINGS_FILE))) {
      fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to write settings.json", e);
  }
}

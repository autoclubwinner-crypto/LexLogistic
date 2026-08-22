import { kvGet, kvSet } from "./lib/upstash";

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
  const next = { ...current, ...settings };
  await kvSet('rex:settings', next);
}


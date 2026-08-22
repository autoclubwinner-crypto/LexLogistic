// Тонкий REST-клиент к Upstash Redis. Работает по HTTP, без TCP-соединения.
const BASE_URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function command<T = unknown>(cmd: (string | number)[]): Promise<T> {
  if (!BASE_URL || !TOKEN) {
    console.error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN не заданы');
    return null as any; // Allow silent failure if not configured yet, so the app doesn't crash completely.
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
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error(`kvGet error for ${key}:`, e);
    return null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    await command(['SET', key, JSON.stringify(value)]);
  } catch (e) {
    console.error(`kvSet error for ${key}:`, e);
  }
}

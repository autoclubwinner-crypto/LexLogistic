import axios from "axios";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

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
          timeout: 4500,
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

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const data = await fetchNewsData();
    return res.status(200).json(data);
  } catch (error: any) {
    return res.status(200).json({});
  }
}

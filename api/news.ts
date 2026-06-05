export default async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    const rssSources = [
      "https://rssexport.rbc.ru/rbcnews/news/30/full.rss",
      "https://www.kommersant.ru/RSS/news.xml",
      "https://lenta.ru/rss/news/economics"
    ];

    const results: Record<string, string | null> = {};
    
    await Promise.allSettled(rssSources.map(async (source) => {
        try {
            const fetchRes = await fetch(source, {
              headers: {
                  'User-Agent': 'Mozilla/5.0'
              }
            });
            if(fetchRes.ok) {
                results[source] = await fetchRes.text();
            } else {
                results[source] = null;
            }
        } catch(e) {
            results[source] = null;
        }
    }));

    res.status(200).json(results);
}

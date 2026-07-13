export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const [rapiraRes, xeRes] = await Promise.allSettled([
      fetch('https://api.rapira.net/market/exchange-plate-mini?symbol=USDT/RUB', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'application/json'
        }
      }),
      fetch('https://open.er-api.com/v6/latest/USD')
    ]);

    let usdtRubRaw = 0;
    let xeEur = 0;

    if (rapiraRes.status === 'fulfilled' && rapiraRes.value.ok) {
        try {
            const rapiraPlate = (await rapiraRes.value.json()) as any;
            if(rapiraPlate?.ask?.items && Array.isArray(rapiraPlate.ask.items)) {
                const items = rapiraPlate.ask.items;
                if (items.length > 11) {
                  usdtRubRaw = parseFloat(items[11].price);
                } else if (items.length > 0) {
                  usdtRubRaw = parseFloat(items[items.length - 1].price);
                }
            }
        } catch(e) {
            console.error("Parse rapira", e);
        }
    }

    if (xeRes.status === 'fulfilled' && xeRes.value.ok) {
        try {
            const data = (await xeRes.value.json()) as any;
            if (data?.rates?.EUR) {
                xeEur = data.rates.EUR;
            }
        } catch(e) {
            console.error("Parse er-api", e);
        }
    }
    
    res.status(200).json({ usdtRubRaw, xeEur });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch rates" });
  }
}

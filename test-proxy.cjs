const fetch = require('node-fetch');

async function test() {
    const proxies = [
        "https://api.allorigins.win/raw?url=",
        "https://api.codetabs.com/v1/proxy/?quest=",
        "https://thingproxy.freeboard.io/fetch/"
    ];
    
    for (const proxy of proxies) {
        try {
            console.log(`Testing ${proxy}...`);
            const res = await fetch(proxy + "https://api.rapira.net/market/exchange-plate-mini?symbol=USDT/RUB", {
                method: 'POST',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            const text = await res.text();
            if (text.includes("ask") && text.includes("items")) {
                console.log(`SUCCESS with ${proxy}`);
                return;
            } else {
                console.log(`Failed with ${proxy}, response length: ${text.length}`);
            }
        } catch (e) {
            console.log(`Error with ${proxy}: ${e.message}`);
        }
    }
}
test();

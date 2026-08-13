import fetch from 'node-fetch';
async function test() {
  const res = await fetch('https://api2.bybit.com/fiat/otc/item/online', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({"userId":"","tokenId":"USDT","currencyId":"RUB","payment":[],"side":"1","size":"10","page":"1","amount":"","authMaker":false,"canTrade":false})
  });
  console.log(await res.text());
}
test();

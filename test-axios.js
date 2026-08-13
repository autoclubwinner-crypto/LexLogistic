import axios from 'axios';
async function test() {
  const res = await axios.post("https://api2.bybit.com/fiat/otc/item/online", {
    userId: "", tokenId: "USDT", currencyId: "RUB", payment: [], side: "1", size: "10", page: "1", amount: "", authMaker: false, canTrade: false
  }, {
    timeout: 3500,
    headers: { "User-Agent": "Mozilla/5.0", "Content-Type": "application/json" }
  });
  console.log(res.data.result.items[0]);
}
test();

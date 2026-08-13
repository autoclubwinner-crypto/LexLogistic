import axios from 'axios';
async function test() {
  const res = await axios.post("https://api2.bybit.com/fiat/otc/item/online", {
    userId: "", tokenId: "USDT", currencyId: "RUB", payment: [], side: "1", size: "10", page: "1", amount: "10000", authMaker: false, canTrade: false
  }, {
    headers: { "User-Agent": "Mozilla/5.0", "Content-Type": "application/json" }
  });
  const items = res.data.result.items;
  items.forEach(i => console.log(i.price, i.remark.substring(0,20), i.payments));
}
test();

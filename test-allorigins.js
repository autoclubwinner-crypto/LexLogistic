import fetch from 'node-fetch';
async function test() {
    try {
        const res = await fetch("https://api.allorigins.win/get?url=https://garantex.org/api/v2/depth?market=usdtrub");
        const data = await res.json();
        console.log("Success allorigins", data.contents.substring(0, 50));
    } catch(e) {
        console.error(e);
    }
}
test();

import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('https://rus-exchange.org/', { waitUntil: 'networkidle2' });
  await page.screenshot({ path: 'rus-exchange.png' });
  console.log("Screenshot saved.");
  await browser.close();
})();

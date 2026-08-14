import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  // Intercept console messages
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  // Intercept network requests
  page.on('response', async response => {
    if (response.url().includes('/api/rates') || response.url().includes('cbr')) {
      console.log('NETWORK:', response.url(), response.status());
    }
  });

  await page.goto('https://rus-exchange.org/', { waitUntil: 'networkidle2' });
  
  // Extract the text of the cards
  const cards = await page.$$eval('div', divs => {
    return divs.filter(d => d.textContent.includes('RUB/USDT')).map(d => d.textContent).slice(0, 1);
  });
  console.log('CARDS:', cards);
  
  await browser.close();
})();

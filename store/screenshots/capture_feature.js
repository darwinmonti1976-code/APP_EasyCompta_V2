const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const graphics = [
  'feature_graphic',
  'feature_graphic_dark',
];

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  for (const name of graphics) {
    const htmlPath = path.join(__dirname, `${name}.html`);
    const url = `file:///${htmlPath.replace(/\\/g, '/')}`;
    const outPath = path.join(__dirname, 'png', `${name}.png`);

    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 500, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: outPath, fullPage: false });
    await page.close();

    const { size } = fs.statSync(outPath);
    console.log(`✓ ${name}.png — ${(size / 1024).toFixed(0)} KB — 1024×500 px`);
  }

  await browser.close();
})();

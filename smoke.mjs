import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push('PAGE ERROR: ' + err.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
console.log('Errors found:', errors.length);
errors.forEach(e => console.log(e));
const canvas = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  return c ? `${c.width}x${c.height}` : 'NO CANVAS';
});
console.log('Canvas:', canvas);
await browser.close();

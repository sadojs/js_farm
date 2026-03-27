const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();

  // Desktop screenshots
  const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dp = await desktopCtx.newPage();
  await dp.goto('http://localhost:5173');
  await dp.waitForTimeout(1000);

  // Login
  await dp.fill('input[type="email"]', 'admin@farm.com');
  await dp.fill('input[type="password"]', 'admin123');
  await dp.click('button[type="submit"]');
  await dp.waitForTimeout(2000);

  // Dashboard
  await dp.screenshot({ path: '/tmp/review-dashboard-desktop.png', fullPage: true });

  // Devices page
  await dp.goto('http://localhost:5173/devices');
  await dp.waitForTimeout(2000);
  await dp.screenshot({ path: '/tmp/review-devices-desktop.png', fullPage: true });

  // Alerts page
  await dp.goto('http://localhost:5173/alerts');
  await dp.waitForTimeout(2000);
  await dp.screenshot({ path: '/tmp/review-alerts-desktop.png', fullPage: true });

  await desktopCtx.close();

  // Mobile screenshots (iPhone 14 size)
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await mobileCtx.newPage();
  await mp.goto('http://localhost:5173');
  await mp.waitForTimeout(1000);

  // Login
  await mp.fill('input[type="email"]', 'admin@farm.com');
  await mp.fill('input[type="password"]', 'admin123');
  await mp.click('button[type="submit"]');
  await mp.waitForTimeout(2000);

  // Dashboard
  await mp.screenshot({ path: '/tmp/review-dashboard-mobile.png', fullPage: true });

  // Devices page
  await mp.goto('http://localhost:5173/devices');
  await mp.waitForTimeout(2000);
  await mp.screenshot({ path: '/tmp/review-devices-mobile.png', fullPage: true });

  // Alerts page
  await mp.goto('http://localhost:5173/alerts');
  await mp.waitForTimeout(2000);
  await mp.screenshot({ path: '/tmp/review-alerts-mobile.png', fullPage: true });

  await mobileCtx.close();
  await browser.close();
  console.log('All screenshots captured');
})();

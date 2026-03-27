const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const OUT = '/tmp/farmer-review';

  // Create output directory
  const fs = require('fs');
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  async function login(page) {
    await page.goto('http://localhost:5173/login');
    await page.waitForTimeout(500);
    await page.fill('input[type="email"]', 'test@farm.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
  }

  async function capturePages(pages) {
    for (const { name, url, actions, waitFor } of pages) {
      // Desktop
      const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const dp = await dCtx.newPage();
      await login(dp);
      await dp.goto(url);
      await dp.waitForTimeout(2000);
      if (waitFor) await dp.waitForTimeout(waitFor);
      if (actions) await actions(dp);
      await dp.screenshot({ path: `${OUT}/${name}-desktop.png`, fullPage: true });
      await dCtx.close();

      // Mobile
      const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const mp = await mCtx.newPage();
      await login(mp);
      await mp.goto(url);
      await mp.waitForTimeout(2000);
      if (waitFor) await mp.waitForTimeout(waitFor);
      if (actions) await actions(mp);
      await mp.screenshot({ path: `${OUT}/${name}-mobile.png`, fullPage: true });
      await mCtx.close();
    }
  }

  // All main pages
  const mainPages = [
    { name: '01-dashboard', url: 'http://localhost:5173/dashboard' },
    { name: '02-devices', url: 'http://localhost:5173/devices' },
    { name: '03-groups', url: 'http://localhost:5173/groups' },
    { name: '04-sensors', url: 'http://localhost:5173/sensors' },
    { name: '05-automation', url: 'http://localhost:5173/automation' },
    { name: '06-reports', url: 'http://localhost:5173/reports', waitFor: 2000 },
    { name: '07-harvest', url: 'http://localhost:5173/harvest' },
    { name: '08-alerts', url: 'http://localhost:5173/alerts' },
    { name: '09-users', url: 'http://localhost:5173/users' },
  ];

  await capturePages(mainPages);

  // Modals
  const modalPages = [
    {
      name: '10-modal-device-add',
      url: 'http://localhost:5173/devices',
      actions: async (page) => {
        const btn = page.locator('button:has-text("장비 추가")').first();
        if (await btn.isVisible()) {
          await btn.click();
          await page.waitForTimeout(1000);
        }
      }
    },
    {
      name: '11-modal-group-add',
      url: 'http://localhost:5173/groups',
      actions: async (page) => {
        const btn = page.locator('button:has-text("그룹 추가")').first();
        if (await btn.isVisible()) {
          await btn.click();
          await page.waitForTimeout(1000);
        }
      }
    },
    {
      name: '12-modal-automation-add',
      url: 'http://localhost:5173/automation',
      actions: async (page) => {
        const btn = page.locator('button:has-text("룰 추가")').first();
        if (await btn.isVisible()) {
          await btn.click();
          await page.waitForTimeout(1000);
        }
      }
    },
    {
      name: '13-modal-harvest-add',
      url: 'http://localhost:5173/harvest',
      actions: async (page) => {
        const btn = page.locator('button:has-text("배치 추가")').first();
        if (await btn.isVisible()) {
          await btn.click();
          await page.waitForTimeout(1000);
        }
      }
    },
  ];

  await capturePages(modalPages);

  await browser.close();
  console.log('Farmer review screenshots captured to ' + OUT);
})();

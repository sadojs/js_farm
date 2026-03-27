const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const OUT = '/tmp/review';

  // Helper: screenshot both desktop and mobile
  async function capturePages(pages) {
    for (const { name, url, actions, waitFor } of pages) {
      // Desktop
      const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const dp = await dCtx.newPage();
      await login(dp);
      await dp.goto(url);
      await dp.waitForTimeout(1500);
      if (waitFor) await dp.waitForTimeout(waitFor);
      if (actions) await actions(dp);
      await dp.screenshot({ path: `${OUT}/${name}-desktop.png`, fullPage: true });
      await dCtx.close();

      // Mobile
      const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const mp = await mCtx.newPage();
      await login(mp);
      await mp.goto(url);
      await mp.waitForTimeout(1500);
      if (waitFor) await mp.waitForTimeout(waitFor);
      if (actions) await actions(mp);
      await mp.screenshot({ path: `${OUT}/${name}-mobile.png`, fullPage: true });
      await mCtx.close();
    }
  }

  async function login(page) {
    await page.goto('http://localhost:5173/login');
    await page.waitForTimeout(500);
    await page.fill('input[type="email"]', 'admin@farm.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);
  }

  // 1. All main pages
  const mainPages = [
    { name: '01-dashboard', url: 'http://localhost:5173/dashboard' },
    { name: '02-devices', url: 'http://localhost:5173/devices' },
    { name: '03-groups', url: 'http://localhost:5173/groups' },
    { name: '04-sensors', url: 'http://localhost:5173/sensors' },
    { name: '05-automation', url: 'http://localhost:5173/automation' },
    { name: '06-reports', url: 'http://localhost:5173/reports' },
    { name: '07-harvest', url: 'http://localhost:5173/harvest' },
    { name: '08-alerts', url: 'http://localhost:5173/alerts' },
    { name: '09-users', url: 'http://localhost:5173/users' },
  ];

  await capturePages(mainPages);

  // 2. Modals - need to click buttons to open them
  // Device Registration Modal
  const modalPages = [
    {
      name: '10-modal-device-registration',
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
      name: '11-modal-group-creation',
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
      name: '12-modal-automation-rule',
      url: 'http://localhost:5173/automation',
      actions: async (page) => {
        const btn = page.locator('button:has-text("규칙 추가"), button:has-text("자동화 규칙")').first();
        if (await btn.isVisible()) {
          await btn.click();
          await page.waitForTimeout(1000);
        }
      }
    },
    {
      name: '13-modal-user-add',
      url: 'http://localhost:5173/users',
      actions: async (page) => {
        const btn = page.locator('button:has-text("새 사용자 추가")').first();
        if (await btn.isVisible()) {
          await btn.click();
          await page.waitForTimeout(1000);
        }
      }
    },
    {
      name: '14-modal-harvest-add',
      url: 'http://localhost:5173/harvest',
      actions: async (page) => {
        const btn = page.locator('button:has-text("수확 기록"), button:has-text("기록 추가"), button:has-text("추가")').first();
        if (await btn.isVisible()) {
          await btn.click();
          await page.waitForTimeout(1000);
        }
      }
    },
  ];

  await capturePages(modalPages);

  // 3. Dark mode screenshots for key pages
  const darkPages = [
    {
      name: '15-dark-dashboard',
      url: 'http://localhost:5173/dashboard',
      actions: async (page) => {
        // Try clicking dark mode toggle
        const darkBtn = page.locator('button:has-text("어둡게"), button.dark-toggle, [class*="dark"]').first();
        if (await darkBtn.isVisible().catch(() => false)) {
          await darkBtn.click();
          await page.waitForTimeout(500);
        }
      }
    },
    {
      name: '16-dark-devices',
      url: 'http://localhost:5173/devices',
      actions: async (page) => {
        const darkBtn = page.locator('button:has-text("어둡게")').first();
        if (await darkBtn.isVisible().catch(() => false)) {
          await darkBtn.click();
          await page.waitForTimeout(500);
        }
      }
    },
  ];

  await capturePages(darkPages);

  await browser.close();
  console.log('Full review screenshots captured');
})();

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5173';

async function main() {
  const browser = await chromium.launch({ headless: true });

  for (const vp of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.name === 'mobile' ? 2 : 1,
    });
    const page = await context.newPage();

    // Login as admin
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('#email', 'admin@farm.com');
    await page.fill('#password', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await page.waitForTimeout(1500);

    // Navigate to users
    await page.goto(`${BASE_URL}/users`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Take a screenshot of the page content for debugging
    console.log(`[${vp.name}] Users page loaded`);

    // Try to click "새 사용자 추가" button
    try {
      // Try multiple selectors
      const btn = page.locator('button').filter({ hasText: '새 사용자' }).first();
      if (await btn.count() > 0) {
        await btn.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `./screenshots/admin/${vp.name}/modal-user-form-add.png`, fullPage: true });
        console.log(`[${vp.name}] Captured: modal-user-form-add`);
        // Close
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      } else {
        console.log(`[${vp.name}] "새 사용자 추가" button not found`);
        // Try any button with "추가"
        const allBtns = await page.locator('button').allTextContents();
        console.log(`[${vp.name}] Available buttons:`, allBtns.join(', '));
      }
    } catch (e) {
      console.log(`[${vp.name}] Error:`, (e as Error).message.slice(0, 100));
    }

    // Try to click edit button on first user row
    try {
      await page.goto(`${BASE_URL}/users`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      // Try emoji button
      const editBtns = page.locator('button').filter({ hasText: '✏️' });
      if (await editBtns.count() > 0) {
        await editBtns.first().click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `./screenshots/admin/${vp.name}/modal-user-form-edit.png`, fullPage: true });
        console.log(`[${vp.name}] Captured: modal-user-form-edit`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      } else {
        console.log(`[${vp.name}] Edit button not found, trying btn-icon`);
        const iconBtns = page.locator('.btn-icon').first();
        if (await iconBtns.count() > 0) {
          await iconBtns.click();
          await page.waitForTimeout(1000);
          await page.screenshot({ path: `./screenshots/admin/${vp.name}/modal-user-form-edit.png`, fullPage: true });
          console.log(`[${vp.name}] Captured: modal-user-form-edit (via btn-icon)`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        }
      }
    } catch (e) {
      console.log(`[${vp.name}] Edit error:`, (e as Error).message.slice(0, 100));
    }

    // Project assign
    try {
      await page.goto(`${BASE_URL}/users`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      const assignBtns = page.locator('button').filter({ hasText: '🔗' });
      if (await assignBtns.count() > 0) {
        await assignBtns.first().click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `./screenshots/admin/${vp.name}/modal-project-assign.png`, fullPage: true });
        console.log(`[${vp.name}] Captured: modal-project-assign`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    } catch (e) {
      console.log(`[${vp.name}] Assign error:`, (e as Error).message.slice(0, 100));
    }

    // Delete confirm
    try {
      await page.goto(`${BASE_URL}/users`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      const deleteBtns = page.locator('button').filter({ hasText: '🗑️' });
      if (await deleteBtns.count() > 0) {
        await deleteBtns.first().click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `./screenshots/admin/${vp.name}/modal-confirm-delete.png`, fullPage: true });
        console.log(`[${vp.name}] Captured: modal-confirm-delete`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    } catch (e) {
      console.log(`[${vp.name}] Delete error:`, (e as Error).message.slice(0, 100));
    }

    await context.close();
  }

  await browser.close();
  console.log('Done!');
}

main().catch(console.error);

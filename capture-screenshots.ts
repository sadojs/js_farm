import { chromium, type Page, type Browser } from 'playwright';

const BASE_URL = 'http://localhost:5173';
const SCREENSHOT_DIR = './screenshots';

interface Account {
  name: string;
  email: string;
  password: string;
  role: string;
}

const ACCOUNTS: Account[] = [
  { name: 'admin', email: 'admin@farm.com', password: 'admin123', role: 'admin' },
  { name: 'farm', email: 'test@farm.com', password: 'admin123', role: 'farm_admin' },
];

// Admin accessible routes
const ADMIN_ROUTES = [
  { path: '/login', name: 'login', needsAuth: false },
  { path: '/dashboard', name: 'dashboard', needsAuth: true },
  { path: '/sensors', name: 'sensors', needsAuth: true },
  { path: '/devices', name: 'devices', needsAuth: true },
  { path: '/groups', name: 'groups', needsAuth: true },
  { path: '/automation', name: 'automation', needsAuth: true },
  { path: '/users', name: 'users', needsAuth: true },
  { path: '/reports', name: 'reports', needsAuth: true },
  { path: '/harvest', name: 'harvest', needsAuth: true },
  { path: '/harvest-rec', name: 'harvest-rec', needsAuth: true },
  { path: '/alerts', name: 'alerts', needsAuth: true },
];

// Farm admin can't access /users
const FARM_ROUTES = ADMIN_ROUTES.filter(r => r.name !== 'users');

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

async function login(page: Page, account: Account): Promise<void> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', account.email);
  await page.fill('#password', account.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  await page.waitForTimeout(1500);
}

async function captureFullPage(page: Page, filepath: string): Promise<void> {
  await page.waitForTimeout(800);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`  📸 ${filepath}`);
}

async function capturePages(page: Page, account: Account, viewport: { name: string; width: number; height: number }): Promise<void> {
  const routes = account.role === 'admin' ? ADMIN_ROUTES : FARM_ROUTES;
  const dir = `${SCREENSHOT_DIR}/${account.name}/${viewport.name}`;

  for (const route of routes) {
    if (!route.needsAuth && route.name === 'login') {
      // Skip login page for authenticated sessions, capture separately
      continue;
    }
    try {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1500);

      // Scroll down to load lazy content
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);

      await captureFullPage(page, `${dir}/${route.name}.png`);
    } catch (e) {
      console.log(`  ⚠️ Skipped ${route.name}: ${(e as Error).message.slice(0, 80)}`);
    }
  }
}

async function captureLoginPage(browser: Browser): Promise<void> {
  console.log('\n📄 Capturing Login Page...');
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await captureFullPage(page, `${SCREENSHOT_DIR}/login-${viewport.name}.png`);
    await context.close();
  }
}

async function captureAdminModals(page: Page, viewport: { name: string; width: number; height: number }): Promise<void> {
  const dir = `${SCREENSHOT_DIR}/admin/${viewport.name}`;

  // 1. UserFormModal - 새 사용자 추가
  console.log('  🔲 UserFormModal (Add User)...');
  try {
    await page.goto(`${BASE_URL}/users`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const addBtn = page.locator('button:has-text("새 사용자 추가")');
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(800);
      await captureFullPage(page, `${dir}/modal-user-form-add.png`);

      // Close modal
      const closeBtn = page.locator('.modal-overlay, .modal-close, button:has-text("취소")').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
      await page.waitForTimeout(500);
    }
  } catch (e) {
    console.log(`  ⚠️ UserFormModal: ${(e as Error).message.slice(0, 80)}`);
  }

  // 2. UserFormModal - 사용자 편집
  console.log('  🔲 UserFormModal (Edit User)...');
  try {
    await page.goto(`${BASE_URL}/users`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const editBtn = page.locator('button[title="편집"]').first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await page.waitForTimeout(800);
      await captureFullPage(page, `${dir}/modal-user-form-edit.png`);

      const closeBtn = page.locator('button:has-text("취소")').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
      await page.waitForTimeout(500);
    }
  } catch (e) {
    console.log(`  ⚠️ Edit User Modal: ${(e as Error).message.slice(0, 80)}`);
  }

  // 3. ProjectAssignModal
  console.log('  🔲 ProjectAssignModal...');
  try {
    await page.goto(`${BASE_URL}/users`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const assignBtn = page.locator('button[title="센서 프로젝트 할당"]').first();
    if (await assignBtn.isVisible()) {
      await assignBtn.click();
      await page.waitForTimeout(800);
      await captureFullPage(page, `${dir}/modal-project-assign.png`);

      const closeBtn = page.locator('button:has-text("취소"), button:has-text("닫기")').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
      await page.waitForTimeout(500);
    }
  } catch (e) {
    console.log(`  ⚠️ ProjectAssignModal: ${(e as Error).message.slice(0, 80)}`);
  }

  // 4. ConfirmDialog (delete user)
  console.log('  🔲 ConfirmDialog (Delete User)...');
  try {
    await page.goto(`${BASE_URL}/users`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const deleteBtn = page.locator('button[title="삭제"]').first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      await page.waitForTimeout(800);
      await captureFullPage(page, `${dir}/modal-confirm-delete.png`);

      const cancelBtn = page.locator('button:has-text("취소")').first();
      if (await cancelBtn.isVisible()) await cancelBtn.click();
      await page.waitForTimeout(500);
    }
  } catch (e) {
    console.log(`  ⚠️ ConfirmDialog: ${(e as Error).message.slice(0, 80)}`);
  }
}

async function captureAutomationModals(page: Page, accountName: string, viewport: { name: string; width: number; height: number }): Promise<void> {
  const dir = `${SCREENSHOT_DIR}/${accountName}/${viewport.name}`;

  // RuleWizardModal
  console.log('  🔲 RuleWizardModal...');
  try {
    await page.goto(`${BASE_URL}/automation`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const addBtn = page.locator('button:has-text("룰 추가")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(800);
      await captureFullPage(page, `${dir}/modal-rule-wizard.png`);

      // Close
      const closeBtn = page.locator('button:has-text("취소"), .modal-close').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
      await page.waitForTimeout(500);
    }
  } catch (e) {
    console.log(`  ⚠️ RuleWizardModal: ${(e as Error).message.slice(0, 80)}`);
  }

  // Edit existing rule
  console.log('  🔲 AutomationEditModal (Edit Rule)...');
  try {
    await page.goto(`${BASE_URL}/automation`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const ruleCard = page.locator('.rule-card').first();
    if (await ruleCard.isVisible()) {
      await ruleCard.click();
      await page.waitForTimeout(800);
      await captureFullPage(page, `${dir}/modal-rule-edit.png`);

      const closeBtn = page.locator('button:has-text("취소"), .modal-close').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
      await page.waitForTimeout(500);
    }
  } catch (e) {
    console.log(`  ⚠️ AutomationEditModal: ${(e as Error).message.slice(0, 80)}`);
  }
}

async function captureGroupModals(page: Page, accountName: string, viewport: { name: string; width: number; height: number }): Promise<void> {
  const dir = `${SCREENSHOT_DIR}/${accountName}/${viewport.name}`;

  // Group creation modal
  console.log('  🔲 Group Creation Modal...');
  try {
    await page.goto(`${BASE_URL}/groups`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const addBtn = page.locator('button:has-text("그룹 추가")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(800);
      await captureFullPage(page, `${dir}/modal-group-add.png`);

      const closeBtn = page.locator('button:has-text("취소"), .modal-close').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
      await page.waitForTimeout(500);
    }
  } catch (e) {
    console.log(`  ⚠️ Group Creation Modal: ${(e as Error).message.slice(0, 80)}`);
  }

  // Add device to group modal
  console.log('  🔲 Add Device to Group Modal...');
  try {
    await page.goto(`${BASE_URL}/groups`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const addDeviceBtn = page.locator('button[aria-label="장비 추가"]').first();
    if (await addDeviceBtn.isVisible()) {
      await addDeviceBtn.click();
      await page.waitForTimeout(800);
      await captureFullPage(page, `${dir}/modal-group-add-device.png`);

      const closeBtn = page.locator('button:has-text("취소"), .modal-close').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
      await page.waitForTimeout(500);
    }
  } catch (e) {
    console.log(`  ⚠️ Add Device Modal: ${(e as Error).message.slice(0, 80)}`);
  }

  // EnvConfig modal
  console.log('  🔲 EnvConfig Modal...');
  try {
    await page.goto(`${BASE_URL}/groups`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const envBtn = page.locator('button[aria-label="환경설정"]').first();
    if (await envBtn.isVisible()) {
      await envBtn.click();
      await page.waitForTimeout(800);
      await captureFullPage(page, `${dir}/modal-env-config.png`);

      const closeBtn = page.locator('button:has-text("취소"), button:has-text("닫기"), .modal-close').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
      await page.waitForTimeout(500);
    }
  } catch (e) {
    console.log(`  ⚠️ EnvConfig Modal: ${(e as Error).message.slice(0, 80)}`);
  }
}

async function captureHarvestModals(page: Page, accountName: string, viewport: { name: string; width: number; height: number }): Promise<void> {
  const dir = `${SCREENSHOT_DIR}/${accountName}/${viewport.name}`;

  // Batch add modal
  console.log('  🔲 Harvest Batch Add Modal...');
  try {
    await page.goto(`${BASE_URL}/harvest`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const addBtn = page.locator('button:has-text("배치 추가")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(800);
      await captureFullPage(page, `${dir}/modal-harvest-batch-add.png`);

      const closeBtn = page.locator('button:has-text("취소"), .modal-close').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
      await page.waitForTimeout(500);
    }
  } catch (e) {
    console.log(`  ⚠️ Harvest Batch Modal: ${(e as Error).message.slice(0, 80)}`);
  }
}

async function captureDeviceModals(page: Page, accountName: string, viewport: { name: string; width: number; height: number }): Promise<void> {
  const dir = `${SCREENSHOT_DIR}/${accountName}/${viewport.name}`;

  console.log('  🔲 Device Registration / Detail Modals...');
  try {
    await page.goto(`${BASE_URL}/devices`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Check for any add/register device button
    const addBtn = page.locator('button:has-text("장비 등록"), button:has-text("장비 추가"), button:has-text("등록")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(800);
      await captureFullPage(page, `${dir}/modal-device-register.png`);

      const closeBtn = page.locator('button:has-text("취소"), .modal-close').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
      await page.waitForTimeout(500);
    }
  } catch (e) {
    console.log(`  ⚠️ Device Modal: ${(e as Error).message.slice(0, 80)}`);
  }
}

async function captureSensorModals(page: Page, accountName: string, viewport: { name: string; width: number; height: number }): Promise<void> {
  const dir = `${SCREENSHOT_DIR}/${accountName}/${viewport.name}`;

  console.log('  🔲 Sensor Detail / Filter Modals...');
  try {
    await page.goto(`${BASE_URL}/sensors`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Try clicking a sensor card for detail modal
    const sensorCard = page.locator('.sensor-card, .device-card, .card').first();
    if (await sensorCard.isVisible()) {
      await sensorCard.click();
      await page.waitForTimeout(800);

      // Check if a modal opened
      const modal = page.locator('.modal-overlay, .modal, .detail-modal, .chart-modal').first();
      if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
        await captureFullPage(page, `${dir}/modal-sensor-detail.png`);

        const closeBtn = page.locator('button:has-text("닫기"), button:has-text("취소"), .modal-close').first();
        if (await closeBtn.isVisible()) await closeBtn.click();
        await page.waitForTimeout(500);
      }
    }
  } catch (e) {
    console.log(`  ⚠️ Sensor Modal: ${(e as Error).message.slice(0, 80)}`);
  }
}

async function captureAlertModals(page: Page, accountName: string, viewport: { name: string; width: number; height: number }): Promise<void> {
  const dir = `${SCREENSHOT_DIR}/${accountName}/${viewport.name}`;

  console.log('  🔲 Alert Modals...');
  try {
    await page.goto(`${BASE_URL}/alerts`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Check for any add alert button
    const addBtn = page.locator('button:has-text("알림 추가"), button:has-text("알림 설정"), button:has-text("추가")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(800);
      await captureFullPage(page, `${dir}/modal-alert-add.png`);

      const closeBtn = page.locator('button:has-text("취소"), .modal-close').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
      await page.waitForTimeout(500);
    }
  } catch (e) {
    console.log(`  ⚠️ Alert Modal: ${(e as Error).message.slice(0, 80)}`);
  }
}

async function main() {
  console.log('🚀 Starting Smart Farm Platform Screenshot Capture\n');

  const browser = await chromium.launch({ headless: true });

  // Capture login page first (no auth needed)
  await captureLoginPage(browser);

  for (const account of ACCOUNTS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`👤 Account: ${account.name} (${account.email})`);
    console.log(`${'='.repeat(60)}`);

    for (const viewport of VIEWPORTS) {
      console.log(`\n📱 Viewport: ${viewport.name} (${viewport.width}x${viewport.height})`);

      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.name === 'mobile' ? 2 : 1,
      });
      const page = await context.newPage();

      // Login
      console.log('  🔑 Logging in...');
      await login(page, account);

      // Capture all pages
      console.log('  📄 Capturing pages...');
      await capturePages(page, account, viewport);

      // Capture modals
      console.log('  🔲 Capturing modals...');

      if (account.role === 'admin') {
        await captureAdminModals(page, viewport);
      }

      await captureAutomationModals(page, account.name, viewport);
      await captureGroupModals(page, account.name, viewport);
      await captureHarvestModals(page, account.name, viewport);
      await captureDeviceModals(page, account.name, viewport);
      await captureSensorModals(page, account.name, viewport);
      await captureAlertModals(page, account.name, viewport);

      await context.close();
    }
  }

  await browser.close();
  console.log('\n✅ Screenshot capture complete!');
}

main().catch(console.error);

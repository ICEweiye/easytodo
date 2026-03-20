const assert = require('assert');
const { chromium } = require('playwright');

const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE_URL = 'http://127.0.0.1:8787';

async function clearAppStorage(page) {
  await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

async function testOkrEditPreservesKr() {
  const browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true });
  const page = await browser.newPage();
  try {
    await clearAppStorage(page);
    await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });
    const firstCard = page.locator('.okr-card').first();
    await firstCard.waitFor({ state: 'visible' });
    const beforeCounters = await firstCard.locator('.kr-counter').allTextContents();
    await firstCard.locator('.okr-title').click();
    await page.locator('#okrModal.active').waitFor({ state: 'visible' });
    const titleInput = page.locator('#okrTitle');
    const originalTitle = await titleInput.inputValue();
    await titleInput.fill(`${originalTitle} smoke`);
    await page.locator('#okrModal .btn-primary').click();
    await page.locator('#okrModal.active').waitFor({ state: 'hidden' });
    const updatedCard = page.locator('.okr-card').first();
    const cardText = await updatedCard.textContent();
    assert(cardText.includes('smoke'), 'edited OKR title did not update');
    const afterCounters = await updatedCard.locator('.kr-counter').allTextContents();
    assert.deepStrictEqual(afterCounters, beforeCounters, 'KR progress changed after editing OKR');
    console.log('PASS okr-edit-preserves-kr');
  } finally {
    await browser.close();
  }
}

async function testSpecialCharactersRender() {
  const browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true });
  const page = await browser.newPage();
  const okrTitle = `Smoke OKR ' \" <alpha>`;
  const krTitle = `KR ' \" <beta>`;
  const bookTitle = `Smoke Book ' \" <gamma>`;
  const siteName = `Smoke Site ' \" <delta>`;
  try {
    await clearAppStorage(page);
    await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });

    await page.locator('.module .add-btn').nth(0).click();
    await page.locator('#okrTitle').fill(okrTitle);
    await page.locator('#okrStartDate').fill('2026-03-01');
    await page.locator('#okrEndDate').fill('2026-03-31');
    await page.locator('.add-kr-editor-btn').click();
    const lastKrEditor = page.locator('.kr-editor-item').last();
    await lastKrEditor.locator('.kr-text-input').fill(krTitle);
    await lastKrEditor.locator('.kr-weight-input').fill('100');
    await page.locator('#okrModal .btn-primary').click();
    await page.locator('.okr-card').filter({ hasText: okrTitle }).first().waitFor({ state: 'visible' });
    await page.locator('.okr-card').filter({ hasText: krTitle }).first().waitFor({ state: 'visible' });

    await page.locator('.module .add-btn').nth(1).click();
    await page.locator('#bookTitle').fill(bookTitle);
    await page.locator('#bookAuthor').fill('Smoke Author');
    await page.locator('#bookCurrent').fill('1');
    await page.locator('#bookTotal').fill('10');
    await page.locator('#bookModal .btn-primary').click();
    await page.locator('.reading-item').filter({ hasText: bookTitle }).first().waitFor({ state: 'visible' });

    await page.goto(`${BASE_URL}/nav.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('.site-category .action-btn').first().click();
    await page.locator('#siteName').fill(siteName);
    await page.locator('#siteUrl').fill('https://example.com');
    await page.locator('#siteDesc').fill('desc');
    await page.locator('#siteModal .btn-primary').click();
    await page.locator('.site-card .site-name').filter({ hasText: siteName }).first().waitFor({ state: 'visible' });
    console.log('PASS special-characters-render');
  } finally {
    await browser.close();
  }
}

async function testCrossPageSync() {
  const browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true });
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  const uniqueBook = `sync-book-${Date.now()}`;
  try {
    await clearAppStorage(pageA);
    await pageA.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });
    await pageB.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });

    await pageA.locator('.module .add-btn').nth(1).click();
    await pageA.locator('#bookTitle').fill(uniqueBook);
    await pageA.locator('#bookAuthor').fill('sync');
    await pageA.locator('#bookCurrent').fill('1');
    await pageA.locator('#bookTotal').fill('5');
    await pageA.locator('#bookModal .btn-primary').click();
    await pageA.locator('.reading-item').filter({ hasText: uniqueBook }).first().waitFor({ state: 'visible' });
    await pageB.locator('.reading-item').filter({ hasText: uniqueBook }).first().waitFor({ state: 'visible', timeout: 12000 });
    console.log('PASS cross-page-sync');
  } finally {
    await context.close();
    await browser.close();
  }
}

(async () => {
  try {
    await testOkrEditPreservesKr();
    await testSpecialCharactersRender();
    await testCrossPageSync();
  } catch (err) {
    console.error('FAIL', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();

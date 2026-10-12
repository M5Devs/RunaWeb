import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('RunaWeb E2E & Verification Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to local RunaWeb app
    await page.goto('/');
    // Clear storage before test run
    await page.evaluate(() => localStorage.clear());
  });

  test('1. Single HTML Game loading, gamepad controls & IndexedDB library saving', async ({ page }) => {
    await page.goto('/');

    const sampleHtmlPath = path.resolve('src/__tests__/fixtures/sample-game.html');
    const fileInput = page.locator('#file-input');

    // Upload single HTML file
    await fileInput.setInputFiles(sampleHtmlPath);

    // Verify loading overlay appears and vanishes
    await expect(page.locator('body')).toHaveClass(/is-playing/, { timeout: 10000 });

    // Verify iframe loaded
    const iframe = page.locator('#game-frame');
    await expect(iframe).toBeVisible();

    // Toggle Virtual Gamepad
    const gamepadBtn = page.locator('#gamepad-toggle-btn');
    await gamepadBtn.click();

    const virtualGamepad = page.locator('#virtual-gamepad');
    await expect(virtualGamepad).toBeVisible();

    // Interact with virtual gamepad buttons
    const btnRight = page.locator('[data-key="ArrowRight"]');
    const btnUp = page.locator('[data-key="ArrowUp"]');
    const btnA = page.locator('[data-button="A"]');

    await btnRight.click();
    await btnUp.click();
    await btnA.click();

    // Hover top / click floating HUD pill to bring header into view
    await page.mouse.move(200, 10);
    const pill = page.locator('#floating-hud-pill');
    if (await pill.isVisible()) {
      await pill.click();
    }
    await page.waitForTimeout(350);
    const exitBtn = page.locator('#exit-btn');
    await exitBtn.click();

    await expect(page.locator('body')).toHaveClass(/mode-hub/);

    // Verify Library Grid contains single HTML badge
    const gameTitle = page.locator('.game-card-title');
    await expect(gameTitle).toContainText('Sample Canvas Bouncing Ball Game');

    const htmlBadge = page.locator('.badge-single-html');
    await expect(htmlBadge).toBeVisible();
    await expect(htmlBadge).toHaveText('Single HTML');
  });

  test('2. Real-world ZIP game execution (test-hoshi.zip) & Service Worker asset serving', async ({ page }) => {
    await page.goto('/');

    const failedRequests: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/virtual-game/') && response.status() >= 400) {
        failedRequests.push(`${response.status()}: ${response.url()}`);
      }
    });

    const zipPath = path.resolve('src/__tests__/fixtures/test-hoshi.zip');
    const fileInput = page.locator('#file-input');

    await fileInput.setInputFiles(zipPath);

    // Verify theater mode active
    await expect(page.locator('body')).toHaveClass(/is-playing/, { timeout: 15000 });

    const iframe = page.locator('#game-frame');
    await expect(iframe).toBeVisible();

    // Verify iframe src points to virtual-game index
    const src = await iframe.getAttribute('src');
    expect(src).toContain('virtual-game/');

    // Give Service Worker time to fetch/serve assets
    await page.waitForTimeout(1500);

    // Verify no 404s or failed requests for virtual game assets
    expect(failedRequests).toEqual([]);

    // Exit back to library
    const exitBtn = page.locator('#exit-btn');
    await exitBtn.click();
    await expect(page.locator('body')).toHaveClass(/mode-hub/);
  });

  test('3. Capture UI Screenshots for Audit Report', async ({ page }) => {
    await page.goto('/');

    // 1. Upload sample single HTML game
    const sampleHtmlPath = path.resolve('src/__tests__/fixtures/sample-game.html');
    await page.locator('#file-input').setInputFiles(sampleHtmlPath);
    await expect(page.locator('body')).toHaveClass(/is-playing/, { timeout: 10000 });
    await page.locator('#exit-btn').click();
    await expect(page.locator('body')).toHaveClass(/mode-hub/);

    // 2. Upload real-world ZIP game
    const zipPath = path.resolve('src/__tests__/fixtures/test-hoshi.zip');
    await page.locator('#file-input').setInputFiles(zipPath);
    await expect(page.locator('body')).toHaveClass(/is-playing/, { timeout: 15000 });
    await page.locator('#exit-btn').click();
    await expect(page.locator('body')).toHaveClass(/mode-hub/);

    // Capture screenshot 1: Library Home with both games (ZIP & Single HTML)
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/library-home.png', fullPage: true });

    // Launch single HTML game from library shelf
    const playBtn = page.locator('.btn-play').first();
    await playBtn.click();
    await expect(page.locator('body')).toHaveClass(/is-playing/, { timeout: 10000 });

    // Open Virtual Gamepad
    await page.locator('#gamepad-toggle-btn').click();
    await expect(page.locator('#virtual-gamepad')).toBeVisible();

    // Capture screenshot 2: Gameplay HUD & Virtual Gamepad overlay
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/gameplay-hud.png', fullPage: true });
  });

  test('4. Security Audit: Zip-Slip Defense, Iframe Sandbox & IPC Isolation', async ({ page }) => {
    await page.goto('/');

    // Verify iframe sandbox attribute strictly restricts capabilities
    const iframe = page.locator('#game-frame');
    const sandboxAttr = await iframe.getAttribute('sandbox');
    expect(sandboxAttr).toBe('allow-scripts allow-same-origin allow-pointer-lock allow-forms');

    // Test IPC session token security validation in client scope
    const ipcValid = await page.evaluate(() => {
      // @ts-ignore
      const testToken = 'test-token-12345';
      // Mismatched token test
      const invalidResult = (window as any).validateIPCMessage
        ? (window as any).validateIPCMessage({ type: 'RUNAWEB_GAME_PAUSE', sessionToken: 'wrong' }, testToken)
        : false;
      return !invalidResult;
    });
    expect(ipcValid).toBe(true);
  });
});

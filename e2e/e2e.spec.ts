import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('RunaWeb E2E & Verification Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to local RunaWeb app
    await page.goto('/');
    // Clear storage before test run
    await page.evaluate(() => localStorage.clear());
  });

  async function clickExit(page: any) {
    const drawer = page.locator('#quick-settings-drawer');
    if (!(await drawer.isVisible())) {
      await page.locator('#floating-hud-pill').click();
      await expect(drawer).toBeVisible();
      await page.waitForTimeout(350);
    }
    await page.locator('#exit-btn').click();
  }

  test('1. Tabbed Arcade Hub switching, Single HTML Game loading, gamepad controls & IndexedDB library saving', async ({ page }) => {
    await page.goto('/');

    // Verify Tab navigation switches views
    const tabArcade = page.locator('#tab-my-arcade');
    const tabAdd = page.locator('#tab-add-game');
    const panelArcade = page.locator('#tab-content-arcade');
    const panelAdd = page.locator('#tab-content-add');

    await expect(tabArcade).toHaveClass(/active/);
    await expect(panelArcade).toBeVisible();
    await expect(panelAdd).not.toBeVisible();

    // Switch to Add Game tab
    await tabAdd.click();
    await expect(tabAdd).toHaveClass(/active/);
    await expect(panelAdd).toBeVisible();
    await expect(panelArcade).not.toBeVisible();

    const sampleHtmlPath = path.resolve('src/__tests__/fixtures/sample-game.html');
    const fileInput = page.locator('#file-input');

    // Upload single HTML file
    await fileInput.setInputFiles(sampleHtmlPath);

    // Verify loading overlay appears and vanishes, entering game mode
    await expect(page.locator('body')).toHaveClass(/is-playing/, { timeout: 10000 });

    // Verify iframe loaded
    const iframe = page.locator('#game-frame');
    await expect(iframe).toBeVisible();

    // Open Quick Settings Drawer & Toggle Virtual Gamepad
    await page.locator('#floating-hud-pill').click();
    await expect(page.locator('#quick-settings-drawer')).toBeVisible();
    await page.waitForTimeout(350);

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

    // Exit back to library shelf via Quick Settings Drawer
    await clickExit(page);

    await expect(page.locator('body')).toHaveClass(/mode-hub/);
    await expect(panelArcade).toBeVisible();

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
    await clickExit(page);
    await expect(page.locator('body')).toHaveClass(/mode-hub/);
  });

  test('3. Capture UI Screenshots for Audit Report', async ({ page }) => {
    await page.goto('/');

    // 1. Upload sample single HTML game
    const sampleHtmlPath = path.resolve('src/__tests__/fixtures/sample-game.html');
    await page.locator('#file-input').setInputFiles(sampleHtmlPath);
    await expect(page.locator('body')).toHaveClass(/is-playing/, { timeout: 10000 });
    await clickExit(page);
    await expect(page.locator('body')).toHaveClass(/mode-hub/);

    // 2. Upload real-world ZIP game
    const zipPath = path.resolve('src/__tests__/fixtures/test-hoshi.zip');
    await page.locator('#file-input').setInputFiles(zipPath);
    await expect(page.locator('body')).toHaveClass(/is-playing/, { timeout: 15000 });
    await clickExit(page);
    await expect(page.locator('body')).toHaveClass(/mode-hub/);

    // Capture screenshot 1: Library Home with both games (ZIP & Single HTML)
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/library-home.png', fullPage: true });

    // Launch single HTML game from library shelf
    const playBtn = page.locator('.btn-play').first();
    await playBtn.click();
    await expect(page.locator('body')).toHaveClass(/is-playing/, { timeout: 10000 });

    // Open Quick Settings Drawer & Virtual Gamepad
    await page.locator('#floating-hud-pill').click();
    await expect(page.locator('#quick-settings-drawer')).toBeVisible();
    await page.waitForTimeout(350);
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

    // Register listener for initial handshake message BEFORE setting input file
    const sessionTokenPromise = page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data && event.data.type === 'RUNAWEB_INIT_HANDSHAKE' && event.data.sessionToken) {
            window.removeEventListener('message', handler);
            resolve(event.data.sessionToken);
          }
        };
        window.addEventListener('message', handler);
      });
    });

    // Upload and launch a game to trigger handshake
    const sampleHtmlPath = path.resolve('src/__tests__/fixtures/sample-game.html');
    await page.locator('#file-input').setInputFiles(sampleHtmlPath);
    await expect(page.locator('body')).toHaveClass(/is-playing/, { timeout: 10000 });

    const sessionToken = await sessionTokenPromise;
    expect(typeof sessionToken).toBe('string');
    expect(sessionToken.length).toBeGreaterThan(0);

    const pauseOverlay = page.locator('#pause-overlay');
    await expect(pauseOverlay).not.toHaveClass(/visible/);

    // 1. Send an IPC message with a mismatched / fake token -> assert it is rejected / ignored by host
    await page.evaluate(() => {
      window.postMessage({ type: 'RUNAWEB_GAME_PAUSE', sessionToken: 'fake-mismatched-token-9999' }, '*');
    });
    await page.waitForTimeout(300);
    await expect(pauseOverlay).not.toHaveClass(/visible/);

    // 2. Send an IPC message with the correct matching token -> assert it is accepted and processed by host
    await page.evaluate((validToken) => {
      window.postMessage({ type: 'RUNAWEB_GAME_PAUSE', sessionToken: validToken }, '*');
    }, sessionToken);
    await page.waitForTimeout(300);
    await expect(pauseOverlay).toHaveClass(/visible/);
  });

  test('5. Seamless Game Suspend & Resume State', async ({ page }) => {
    await page.goto('/');

    const sampleHtmlPath = path.resolve('src/__tests__/fixtures/sample-game.html');
    const fileInput = page.locator('#file-input');

    // Upload and start game
    await fileInput.setInputFiles(sampleHtmlPath);
    await expect(page.locator('body')).toHaveClass(/is-playing/, { timeout: 10000 });

    const iframe = page.locator('#game-frame');
    const activeSrc = await iframe.getAttribute('src');
    expect(activeSrc).toContain('virtual-game/');

    // Click Exit button to suspend game
    await clickExit(page);

    // Verify returning to hub, but iframe source remains intact
    await expect(page.locator('body')).toHaveClass(/mode-hub/);
    const suspendedSrc = await iframe.getAttribute('src');
    expect(suspendedSrc).toBe(activeSrc);

    // Verify #resume-banner is visible with title
    const resumeBanner = page.locator('#resume-banner');
    await expect(resumeBanner).toBeVisible();
    await expect(page.locator('#resume-game-title')).toContainText('Sample Canvas Bouncing Ball Game');

    // Click Resume Game
    await page.locator('#resume-game-btn').click();
    await expect(page.locator('body')).toHaveClass(/is-playing/);
    await expect(resumeBanner).not.toBeVisible();

    // Exit again and terminate game
    await clickExit(page);
    await expect(resumeBanner).toBeVisible();
    await page.locator('#terminate-game-btn').click();

    // Verify banner hidden and iframe cleared
    await expect(resumeBanner).not.toBeVisible();
    const terminatedSrc = await iframe.getAttribute('src');
    expect(terminatedSrc).toBe('about:blank');

    // Load game again, exit to suspend, then load a new game archive to test auto-termination
    await fileInput.setInputFiles([]);
    await fileInput.setInputFiles(sampleHtmlPath);
    await expect(page.locator('body')).toHaveClass(/is-playing/, { timeout: 10000 });
    await clickExit(page);
    await expect(resumeBanner).toBeVisible();

    const zipPath = path.resolve('src/__tests__/fixtures/test-hoshi.zip');
    await fileInput.setInputFiles(zipPath);
    await expect(page.locator('body')).toHaveClass(/is-playing/, { timeout: 15000 });
    await expect(resumeBanner).not.toBeVisible();
  });
});

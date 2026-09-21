import { chromium } from '@playwright/test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(__dirname, '..');
const projectDir = resolve(frontendDir, '..');
const backendDir = join(projectDir, 'backend');
const outputDir = join(projectDir, 'docs', 'images');
const runtimeDir = mkdtempSync(join(tmpdir(), 'food-map-showcase-'));
const backendPort = 3021;
const frontendPort = 5175;
const processes = [];

function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      ...options
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.once('error', rejectPromise);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else rejectPromise(new Error(`${command} ${args.join(' ')} exited with ${code}\n${stdout}\n${stderr}`));
    });
  });
}

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    ...options
  });
  processes.push(child);
  child.stdout?.on('data', (chunk) => process.stdout.write(`[showcase] ${chunk}`));
  child.stderr?.on('data', (chunk) => process.stderr.write(`[showcase] ${chunk}`));
  return child;
}

async function waitFor(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'unknown error'}`);
}

async function stopProcesses() {
  await Promise.all(processes.map(async (child) => {
    if (child.exitCode !== null || child.killed) return;
    child.kill();
    await Promise.race([
      new Promise((resolvePromise) => child.once('exit', resolvePromise)),
      new Promise((resolvePromise) => setTimeout(resolvePromise, 1500))
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }));
}

const runtimeEnv = {
  ...process.env,
  NODE_ENV: 'development',
  DB_PATH: join(runtimeDir, 'showcase.db'),
  UPLOADS_DIR: join(runtimeDir, 'uploads'),
  BACKUPS_DIR: join(runtimeDir, 'backups'),
  PORT: String(backendPort)
};

let browser;
try {
  mkdirSync(outputDir, { recursive: true });
  await run(process.execPath, ['src/seed.js'], { cwd: backendDir, env: runtimeEnv });

  start(process.execPath, ['src/server.js'], { cwd: backendDir, env: runtimeEnv });
  start(process.execPath, [join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'], {
    cwd: frontendDir,
    env: { ...process.env, FOODMAP_API_TARGET: `http://127.0.0.1:${backendPort}` }
  });
  await Promise.all([
    waitFor(`http://127.0.0.1:${backendPort}/api/health`),
    waitFor(`http://127.0.0.1:${frontendPort}`)
  ]);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'zh-CN',
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${frontendPort}`, { waitUntil: 'networkidle' });

  const welcome = page.locator('.modal').filter({ hasText: '欢迎使用美食地图' });
  await welcome.locator('input[placeholder="你的昵称"]').fill('美食探索家');
  await welcome.locator('.primary-btn').click();
  await welcome.waitFor({ state: 'hidden' });
  await page.locator('.entry-item').first().waitFor({ state: 'visible' });
  await page.waitForTimeout(500);

  await page.screenshot({
    path: join(outputDir, 'food-map-overview.png'),
    animations: 'disabled'
  });

  await page.getByRole('button', { name: '统计' }).click();
  const stats = page.locator('.modal').filter({ hasText: '统计概览' });
  await stats.waitFor({ state: 'visible' });
  await stats.locator('.stats-cards').waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: join(outputDir, 'food-map-stats.png'),
    animations: 'disabled'
  });

  console.log(`Showcase screenshots written to ${outputDir}`);
} finally {
  if (browser) await browser.close();
  await stopProcesses();
  rmSync(runtimeDir, { recursive: true, force: true });
}

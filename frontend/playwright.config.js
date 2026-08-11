import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const e2eDir = mkdtempSync(join(tmpdir(), 'food-map-e2e-'));

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    headless: true,
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'node src/server.js',
      cwd: '../backend',
      url: 'http://127.0.0.1:3011/api/health',
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        DB_PATH: join(e2eDir, 'e2e.db'),
        UPLOADS_DIR: join(e2eDir, 'uploads'),
        BACKUPS_DIR: join(e2eDir, 'backups'),
        PORT: '3011'
      }
    },
    {
      command: 'npm run dev -- --port 5174 --strictPort',
      cwd: '.',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        FOODMAP_API_TARGET: 'http://127.0.0.1:3011',
        VITE_AMAP_KEY: ''
      }
    }
  ]
});

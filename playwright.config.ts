import { defineConfig } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Never open the developer's real database or connect an agent in browser tests.
const home = mkdtempSync(join(tmpdir(), 'clawtask-browser-'));
process.on('exit', () => rmSync(home, { recursive: true, force: true }));
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3347', browserName: 'chromium', channel: 'chromium', serviceWorkers: 'block' },
  webServer: {
    command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 -p 3347',
    url: 'http://127.0.0.1:3347',
    reuseExistingServer: false,
    env: { HOME: home },
    timeout: 60_000,
  },
});

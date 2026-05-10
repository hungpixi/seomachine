import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

const port = 8877;
const base = `http://127.0.0.1:${port}`;
let child;
let dataDir;

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'seomachine-trial-'));
  child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
    stdio: 'ignore'
  });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/trial/usage`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error('Test server did not start');
});

after(async () => {
  if (child) child.kill('SIGTERM');
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

test('trial meta endpoint returns useful options and quota', async () => {
  const response = await fetch(`${base}/api/trial/meta`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic: 'seo cho website bán hàng' })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.result.titles.length, 5);
  assert.ok(body.usage.remaining >= 0);
});

test('trial brief endpoint builds outline', async () => {
  const response = await fetch(`${base}/api/trial/brief`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-trial-email': 'demo@example.com' },
    body: JSON.stringify({ keyword: 'cách tối ưu content seo' })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.result.outline.length >= 6);
  assert.ok(body.result.meta.titles.length === 5);
});

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

type DigestJson = {
  night: string;
  rows: DigestRow[];
  counts: { ok: number; retry: number; fail: number };
  badLines: number;
};

const NORMAL = '2026-02-01';
const EMPTY = '2026-02-02';
const BAD = '2026-02-03';
const MISSING = '2026-02-04';

let dir: string;
let app: ReturnType<typeof createApp>;

function line(at: string, job: string, status: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ at, job, status, ...extra });
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  // Jobs are written out of order on purpose: both views must list them sorted by name.
  writeFileSync(
    join(dir, `${NORMAL}.jsonl`),
    [
      line('2026-02-01T23:00:00+01:00', 'zeta/sync', 'ok', { owner: 'rook' }),
      line('2026-02-01T23:01:00+01:00', 'beta/flaky', 'retry', { owner: 'ada' }),
      line('2026-02-01T23:02:00+01:00', 'beta/flaky', 'retry', { owner: 'ada' }),
      line('2026-02-01T23:03:00+01:00', 'beta/flaky', 'retry', { owner: 'ada' }),
      line('2026-02-01T23:04:00+01:00', 'beta/flaky', 'ok', { owner: 'ada' }),
      line('2026-02-01T23:05:00+01:00', 'alpha/backup', 'fail', { owner: 'ada', error: 'quota exceeded' }),
      line('2026-02-01T23:06:00+01:00', 'gamma/orphan', 'ok'),
      line('2026-02-01T23:07:00+01:00', 'delta/twice', 'retry', { owner: 'rook' }),
      line('2026-02-01T23:08:00+01:00', 'delta/twice', 'retry', { owner: 'rook' }),
      line('2026-02-01T23:09:00+01:00', 'delta/twice', 'ok', { owner: 'rook' }),
    ].join('\n') + '\n',
  );
  writeFileSync(join(dir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(dir, `${BAD}.jsonl`),
    [
      line('2026-02-03T01:00:00+01:00', 'b/job', 'ok', { owner: 'rook' }),
      'this is not json',
      line('2026-02-03T02:00:00+01:00', 'a/job', 'ok', { owner: 'ada' }),
    ].join('\n') + '\n',
  );
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: dir,
  });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function page(night: string): Promise<{ status: number; html: string }> {
  const res = await app.request(`/digest/${night}`);
  return { status: res.status, html: await res.text() };
}

async function api(night: string): Promise<{ status: number; body: DigestJson }> {
  const res = await app.request(`/api/digest/${night}`);
  return { status: res.status, body: (await res.json()) as DigestJson };
}

describe('GET /digest/:night', () => {
  it('answers 200 with an HTML table for a normal night', async () => {
    const res = await app.request(`/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain(`digest · ${NORMAL}`);
    expect(html).toContain('<table>');
    expect(html).not.toContain('unreadable');
  });

  it('answers 404 for a night with no file', async () => {
    const { status, html } = await page(MISSING);
    expect(status).toBe(404);
    expect(html).toContain('not found');
    expect(html).toContain(MISSING);
  });

  it('answers 404 for a night that is not YYYY-MM-DD', async () => {
    expect((await page('nope')).status).toBe(404);
    expect((await page('2026-2-1')).status).toBe(404);
  });

  it('says "nothing ran" for an empty night', async () => {
    const { status, html } = await page(EMPTY);
    expect(status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table>');
  });

  it('shows the unreadable-line note and still lists the other jobs', async () => {
    const { status, html } = await page(BAD);
    expect(status).toBe(200);
    expect(html).toContain('1 unreadable line skipped');
    expect(html).toContain('a/job');
    expect(html).toContain('b/job');
  });

  it('marks retries >= 3 and a fail, and nothing else', async () => {
    const { html } = await page(NORMAL);
    expect(html.match(/⚠ retries/g)).toHaveLength(1);
    expect(html.match(/✗ fail/g)).toHaveLength(1);
    const rows = html.match(/<tr[^>]*>.*?<\/tr>/g) ?? [];
    const rowFor = (job: string): string => rows.find((r) => r.includes(`<td>${job}</td>`)) ?? '';
    expect(rowFor('beta/flaky')).toContain('⚠ retries');
    expect(rowFor('alpha/backup')).toContain('✗ fail');
    expect(rowFor('alpha/backup')).toContain('quota exceeded');
    expect(rowFor('delta/twice')).not.toContain('⚠');
    expect(rowFor('zeta/sync')).not.toContain('⚠');
    expect(rowFor('zeta/sync')).not.toContain('✗');
  });

  it('shows — for a missing owner', async () => {
    const { html } = await page(NORMAL);
    expect(html).toContain('<td>gamma/orphan</td><td>—</td>');
    expect(html).toContain('<td>zeta/sync</td><td>rook</td>');
  });
});

describe('GET /api/digest/:night', () => {
  it('answers 200 with JSON for a normal night', async () => {
    const res = await app.request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as DigestJson;
    expect(body.night).toBe(NORMAL);
    expect(body.rows).toHaveLength(5);
    expect(body.counts).toEqual({ ok: 4, retry: 5, fail: 1 });
    expect(body.badLines).toBe(0);
    const flaky = body.rows.find((r) => r.job === 'beta/flaky');
    expect(flaky).toMatchObject({ owner: 'ada', runs: 4, retries: 3, lastStatus: 'ok' });
    expect(body.rows.find((r) => r.job === 'gamma/orphan')?.owner).toBeNull();
  });

  it('answers 404 for a night with no file', async () => {
    const { status, body } = await api(MISSING);
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'no such night' });
  });

  it('answers 404 for a night that is not YYYY-MM-DD', async () => {
    expect((await api('nope')).status).toBe(404);
    expect((await api('2026-2-1')).status).toBe(404);
  });

  it('gives rows: [] for an empty night', async () => {
    const { status, body } = await api(EMPTY);
    expect(status).toBe(200);
    expect(body.rows).toEqual([]);
    expect(body.counts).toEqual({ ok: 0, retry: 0, fail: 0 });
    expect(body.badLines).toBe(0);
  });

  it('counts the bad line and still returns the other rows', async () => {
    const { status, body } = await api(BAD);
    expect(status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['a/job', 'b/job']);
  });
});

describe('page and JSON agree', () => {
  it.each([NORMAL, BAD])('list the same jobs in the same order for %s', async (night) => {
    const jobs = (await api(night)).body.rows.map((r) => r.job);
    expect(jobs.length).toBeGreaterThan(1);
    const { html } = await page(night);
    const positions = jobs.map((job) => html.indexOf(`<td>${job}</td>`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html.match(/<td>[a-z]+\/[a-z]+<\/td>/g)).toHaveLength(jobs.length);
  });
});

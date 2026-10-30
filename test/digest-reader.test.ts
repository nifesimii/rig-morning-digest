import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(dir, '2026-01-01.jsonl'), '');
  writeFileSync(
    join(dir, '2026-01-02.jsonl'),
    [
      '{"at":"2026-01-02T23:00:00+01:00","job":"b/job","status":"retry","owner":null,"error":"boom"}',
      '{"at":"2026-01-03T00:00:00+01:00","job":"a/job","status":"ok"}',
      '',
      '{"at":"2026-01-03T01:00:00+01:00","job":"b/job","status":"ok","owner":null}',
      '["not","an","object"]',
      '{"at":"2026-01-03T02:00:00+01:00","job":"c/job","status":"weird"}',
    ].join('\n'),
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readNight', () => {
  it('reads runs/2026-10-28.jsonl: 5 jobs, 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });

    const sync = night?.rows.find((r) => r.job === 'lane/sync');
    expect(sync).toEqual({
      job: 'lane/sync',
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
    const backup = night?.rows.find((r) => r.job === 'notes/backup');
    expect(backup?.lastStatus).toBe('fail');
    expect(backup?.lastError).toBe('quota exceeded');
  });

  it('keeps a null owner as a row', () => {
    const row = readNight('runs', '2026-10-28')?.rows.find((r) => r.job === 'digest/render');
    expect(row?.owner).toBeNull();
    expect(row?.runs).toBe(1);
  });

  it('gives null for a night with no file', () => {
    expect(readNight(dir, '1999-01-01')).toBeNull();
  });

  it('gives zero rows for an empty file', () => {
    expect(readNight(dir, '2026-01-01')).toEqual({
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('counts bad lines, skips blank ones, sorts by job, clears the error on a later ok', () => {
    const night = readNight(dir, '2026-01-02');
    expect(night?.badLines).toBe(2);
    expect(night?.rows.map((r) => r.job)).toEqual(['a/job', 'b/job']);
    expect(night?.rows[0]?.owner).toBeNull();
    expect(night?.rows[1]).toMatchObject({ runs: 2, retries: 1, lastStatus: 'ok', lastError: null });
  });

  it('rejects a night string that is not YYYY-MM-DD', () => {
    expect(readNight(dir, '../2026-01-01')).toBeNull();
    expect(readNight(dir, '2026-01-01.jsonl')).toBeNull();
    expect(readNight(dir, '')).toBeNull();
  });
});

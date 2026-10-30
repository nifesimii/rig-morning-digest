import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RUN_STATUSES,
  isNight,
  type DigestRow,
  type Night,
  type NightCounts,
  type ReadNight,
  type RunStatus,
} from './types.js';

type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

function isRunStatus(v: unknown): v is RunStatus {
  return typeof v === 'string' && (RUN_STATUSES as readonly string[]).includes(v);
}

// Parse one line at the edge; `null` means the line doesn't count as a run.
export function parseLine(line: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.job !== 'string' || !isRunStatus(o.status)) return null;
  return {
    at: o.at,
    job: o.job,
    status: o.status,
    // A missing owner and `"owner": null` are the same thing: nobody's.
    owner: typeof o.owner === 'string' ? o.owner : null,
    error: typeof o.error === 'string' ? o.error : null,
  };
}

// Fold a night's lines into one row per job (plus counts and the bad-line tally).
export function foldNight(text: string): Night {
  const byJob = new Map<string, DigestRow>();
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) {
      badLines += 1;
      continue;
    }
    counts[line.status] += 1;
    const row = byJob.get(line.job);
    if (row === undefined) {
      byJob.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        lastStatus: line.status,
        lastError: line.error,
        firstAt: line.at,
        lastAt: line.at,
      });
      continue;
    }
    row.runs += 1;
    if (line.status === 'retry') row.retries += 1;
    row.lastStatus = line.status;
    // lastError follows the last line: an `ok` after a `retry` clears the error, by design.
    row.lastError = line.error;
    row.lastAt = line.at;
    // The owner is the first non-null one seen, so a later null line doesn't erase it.
    if (row.owner === null && line.owner !== null) row.owner = line.owner;
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { rows, counts, badLines };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isNight(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null;
    throw err;
  }
  return foldNight(text);
};

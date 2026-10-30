// Types for the night's run log reader (plan.md § 1). The page (2a), the JSON (2b) and the
// board (2c) all read from these; the reader itself lives in ./read.ts.

// One line of runs/<night>.jsonl: `{ at, job, status, owner, error? }`.
export type RunStatus = 'ok' | 'retry' | 'fail';

export const RUN_STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

// One row per job, in file order of first appearance folded down to a summary.
// Times are the log's own strings, offset included; never converted (docs/styleguide.md).
export type DigestRow = {
  job: string;
  // `null` when the log has no owner or `"owner": null`; the view shows it as `—`.
  owner: string | null;
  // Lines for this job, whatever their status.
  runs: number;
  // Lines for this job with status `retry`.
  retries: number;
  // Status of the job's last line, by file order.
  lastStatus: RunStatus;
  // `error` of the job's last line, or `null` when that line carries none.
  lastError: string | null;
  // `at` of the first and last line for this job, by file order.
  firstAt: string;
  lastAt: string;
};

// Lines per status over the whole night (every parsable line, not one per job).
// The board shows these beside each night as ok / retry / fail.
export type NightCounts = Record<RunStatus, number>;

// What readNight returns for a night that has a file. An empty file gives zero rows.
export type Night = {
  // Sorted by job (plain string order). The page and the JSON render this list as is.
  rows: DigestRow[];
  counts: NightCounts;
  // Lines that didn't parse (bad JSON, or not `{ at: string, job: string, status: RunStatus }`).
  // Counted, never thrown; blank lines are skipped and not counted.
  badLines: number;
};

// A night is `YYYY-MM-DD`; anything else never reaches the file system.
export const NIGHT_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isNight(s: string): boolean {
  return NIGHT_RE.test(s);
}

// Reads `<runsDir>/<night>.jsonl`. Returns `null` when there is no such file, or when `night`
// isn't a valid night string. An existing but empty file is a `Night` with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;

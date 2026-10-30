import type { DigestRow, Night } from '../digest/types.js';

const RETRY_LIMIT = 3;

function marks(row: DigestRow): string[] {
  const out: string[] = [];
  if (row.retries >= RETRY_LIMIT) out.push('⚠ retries');
  if (row.lastStatus === 'fail') out.push('✗ fail');
  return out;
}

export function DigestPage({ night, data }: { night: string; data: Night }) {
  return (
    <>
      <h1>digest · {night}</h1>
      {data.badLines > 0 && (
        <p class="mute">
          <small>
            {data.badLines} unreadable {data.badLines === 1 ? 'line' : 'lines'} skipped
          </small>
        </p>
      )}
      {data.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => {
              const flags = marks(row);
              return (
                <tr class={flags.length > 0 ? 'warn' : undefined}>
                  <td>{row.job}</td>
                  <td>{row.owner ?? '—'}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>
                    {row.lastStatus}
                    {flags.length > 0 && <> {flags.join(' ')}</>}
                  </td>
                  <td>{row.lastError ?? '—'}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

export function DigestNotFound({ night }: { night: string }) {
  return (
    <>
      <h1>digest · not found</h1>
      <p class="mute">no run log for {night}</p>
    </>
  );
}

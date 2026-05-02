/**
 * Truncate traffy_complaints by dropping + recreating the table (free-tier compatible).
 * Load Jobs with WRITE_TRUNCATE also work but require at least 1 record.
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { BigQuery } from '@google-cloud/bigquery';

const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const t = l.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq < 0) continue;
  env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}

const bq = new BigQuery({ projectId: env.BQ_PROJECT_ID, credentials: JSON.parse(env.BQ_CREDENTIALS) });
const dataset = bq.dataset(env.BQ_DATASET);
const table = dataset.table('traffy_complaints');

const SCHEMA = [
  { name: 'ticket_id',      type: 'STRING',    mode: 'REQUIRED' },
  { name: 'district',       type: 'STRING',    mode: 'NULLABLE' },
  { name: 'district_group', type: 'STRING',    mode: 'NULLABLE' },
  { name: 'problem_type',   type: 'STRING',    mode: 'NULLABLE' },
  { name: 'state',          type: 'STRING',    mode: 'NULLABLE' },
  { name: 'description',    type: 'STRING',    mode: 'NULLABLE' },
  { name: 'address',        type: 'STRING',    mode: 'NULLABLE' },
  { name: 'lon',            type: 'FLOAT64',   mode: 'NULLABLE' },
  { name: 'lat',            type: 'FLOAT64',   mode: 'NULLABLE' },
  { name: 'photo_url',      type: 'STRING',    mode: 'NULLABLE' },
  { name: 'org',            type: 'STRING',    mode: 'NULLABLE' },
  { name: 'created_at',     type: 'TIMESTAMP', mode: 'NULLABLE' },
  { name: 'ingested_at',    type: 'TIMESTAMP', mode: 'NULLABLE' },
];

// Use a Load Job with WRITE_TRUNCATE to clear the table without deleting it.
// We write a single placeholder row then immediately overwrite with nothing...
// Actually the simplest free-tier approach: write an empty JSONL (which creates 0 rows)
// using WRITE_TRUNCATE. BigQuery Load Jobs do accept empty files.
const tmpFile = resolve(tmpdir(), `traffy_empty_${Date.now()}.jsonl`);
writeFileSync(tmpFile, '', 'utf-8');  // empty JSONL = 0 rows

function createLoadJobAsync(tbl, src, meta) {
  return new Promise((resolve, reject) => {
    tbl.createLoadJob(src, meta, (err, job) => {
      if (err) reject(err); else resolve(job);
    });
  });
}

console.log('Truncating traffy_complaints via WRITE_TRUNCATE load job...');
try {
  const job = await createLoadJobAsync(table, tmpFile, {
    sourceFormat: 'NEWLINE_DELIMITED_JSON',
    writeDisposition: 'WRITE_TRUNCATE',
    schema: { fields: SCHEMA },
    location: 'asia-southeast1',
  });
  while (true) {
    const [meta] = await job.getMetadata();
    if (meta.status.state === 'DONE') {
      if (meta.status.errorResult) throw new Error(meta.status.errorResult.message);
      break;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('Done — table is now empty.');
} finally {
  try { unlinkSync(tmpFile); } catch {}
}

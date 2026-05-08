import { BigQuery } from '@google-cloud/bigquery';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = {};
for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq < 0) continue;
  env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}

const bq = new BigQuery({ projectId: env.BQ_PROJECT_ID, credentials: JSON.parse(env.BQ_CREDENTIALS) });

const [rows] = await bq.query({
  query: `SELECT
    COUNT(*) AS total_rows,
    COUNT(DISTINCT ticket_id) AS unique_tickets,
    MIN(created_at) AS oldest,
    MAX(created_at) AS newest
  FROM \`${env.BQ_PROJECT_ID}.${env.BQ_DATASET}.traffy_complaints\``,
  location: 'asia-southeast1',
});

const r = rows[0];
console.log(`total rows    : ${Number(r.total_rows).toLocaleString('en')}`);
console.log(`unique tickets: ${Number(r.unique_tickets).toLocaleString('en')}`);
console.log(`oldest        : ${r.oldest?.value ?? r.oldest}`);
console.log(`newest        : ${r.newest?.value ?? r.newest}`);

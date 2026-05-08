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
const P = env.BQ_PROJECT_ID;
const D = env.BQ_DATASET;

// 1. Count by month
const [byMonth] = await bq.query({
  query: `SELECT FORMAT_TIMESTAMP('%Y-%m', created_at) AS month, COUNT(*) AS cnt
          FROM \`${P}.${D}.traffy_complaints\`
          GROUP BY month ORDER BY month`,
  location: 'asia-southeast1',
});
console.log('\n=== Rows by month ===');
byMonth.forEach(r => console.log(r.month ?? 'NULL', Number(r.cnt)));

// 2. Count NULL created_at
const [nullRows] = await bq.query({
  query: `SELECT COUNT(*) AS cnt FROM \`${P}.${D}.traffy_complaints\` WHERE created_at IS NULL`,
  location: 'asia-southeast1',
});
console.log('\nNULL created_at:', Number(nullRows[0].cnt));

// 3. Table metadata
const [meta] = await bq.dataset(D).table('traffy_complaints').getMetadata();
console.log('\n=== Table metadata ===');
console.log('numRows:', meta.numRows);
console.log('numBytes:', meta.numBytes);
console.log('partitionExpiration:', meta.timePartitioning?.expirationMs ?? 'none');

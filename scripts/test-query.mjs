import { readFileSync } from 'fs';
import { resolve } from 'path';
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
const tbl = `\`${env.BQ_PROJECT_ID}.${env.BQ_DATASET}.traffy_complaints\``;

console.log('🔍 Testing dedup + count query...');
const [rows] = await bq.query({
  query: `
    WITH deduped AS (
      SELECT ticket_id, district, state, problem_type, created_at
      FROM ${tbl}
      QUALIFY ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY created_at DESC) = 1
    )
    SELECT
      COUNT(*) AS total_unique,
      COUNTIF(state = 'เสร็จสิ้น') AS resolved,
      COUNTIF(district != 'ไม่ระบุ') AS has_district
    FROM deduped
  `,
  location: 'asia-southeast1',
});

console.log('✅ Result:', rows[0]);
console.log(`   Total unique tickets : ${rows[0].total_unique}`);
console.log(`   Resolved             : ${rows[0].resolved}`);
console.log(`   Has district         : ${rows[0].has_district}`);

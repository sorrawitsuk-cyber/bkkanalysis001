/**
 * สร้าง BigQuery dataset + table traffy_complaints
 * Usage: node scripts/setup-bigquery.mjs
 */

import { BigQuery } from '@google-cloud/bigquery';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local
const envVars = {};
for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq < 0) continue;
  envVars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}

const PROJECT_ID = envVars.BQ_PROJECT_ID;
const DATASET_ID = envVars.BQ_DATASET;
const credentials = JSON.parse(envVars.BQ_CREDENTIALS);

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

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
];

// 1. Create dataset (if not exists)
const [datasets] = await bq.getDatasets();
const datasetExists = datasets.some(d => d.id === DATASET_ID);
if (!datasetExists) {
  await bq.createDataset(DATASET_ID, { location: 'asia-southeast1' });
  console.log(`✅ Dataset created: ${PROJECT_ID}.${DATASET_ID}`);
} else {
  console.log(`ℹ️  Dataset already exists: ${PROJECT_ID}.${DATASET_ID}`);
}

// 2. Create table (if not exists)
const dataset = bq.dataset(DATASET_ID);
const [tables] = await dataset.getTables();
const tableExists = tables.some(t => t.id === 'traffy_complaints');
if (!tableExists) {
  await dataset.createTable('traffy_complaints', {
    schema: SCHEMA,
    timePartitioning: { type: 'MONTH', field: 'created_at' },
  });
  console.log(`✅ Table created: ${PROJECT_ID}.${DATASET_ID}.traffy_complaints`);
} else {
  console.log(`ℹ️  Table already exists: ${PROJECT_ID}.${DATASET_ID}.traffy_complaints`);
}

// 3. Add ingested_at column if missing (idempotent)
try {
  await bq.query({
    query: `ALTER TABLE \`${PROJECT_ID}.${DATASET_ID}.traffy_complaints\`
            ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMP`,
    location: 'asia-southeast1',
  });
  console.log('✅ Column ingested_at ready');
} catch (e) {
  console.warn('⚠️  ingested_at column:', e.message);
}

// 4. Create dedup view: traffy_complaints_current
//    Always shows the latest state per ticket_id (handles status updates)
const viewQuery = `
  SELECT * EXCEPT(rn)
  FROM (
    SELECT *,
      ROW_NUMBER() OVER (
        PARTITION BY ticket_id
        ORDER BY COALESCE(ingested_at, created_at) DESC
      ) AS rn
    FROM \`${PROJECT_ID}.${DATASET_ID}.traffy_complaints\`
  )
  WHERE rn = 1
`;
try {
  await dataset.createTable('traffy_complaints_current', { view: { query: viewQuery, useLegacySql: false } });
  console.log('✅ View created: traffy_complaints_current');
} catch (e) {
  if (e.message?.includes('Already Exists')) {
    // Update view definition in case it changed
    const view = dataset.table('traffy_complaints_current');
    await view.setMetadata({ view: { query: viewQuery, useLegacySql: false } });
    console.log('ℹ️  View updated: traffy_complaints_current');
  } else {
    console.warn('⚠️  View:', e.message);
  }
}

console.log('\n🎉 BigQuery setup เสร็จสมบูรณ์!');
console.log(`   Project : ${PROJECT_ID}`);
console.log(`   Dataset : ${DATASET_ID}`);
console.log(`   Table   : traffy_complaints`);
console.log(`   View    : traffy_complaints_current  (dedup, latest state per ticket)`);

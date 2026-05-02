#!/usr/bin/env node
/**
 * Rebuild or inspect the satellite-cache index.json from R2 object listing.
 *
 * Usage:
 *   node scripts/storage/update-index.mjs [--dry-run] [--print]
 *
 * Flags:
 *   --dry-run   Show what would be written without uploading
 *   --print     Print the current index.json from R2 and exit
 *
 * Environment variables:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   SATELLITE_CACHE_PREFIX  (default: satellite-cache)
 */

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

const CACHE_PREFIX = process.env.SATELLITE_CACHE_PREFIX || 'satellite-cache';

function buildS3Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accountId) throw new Error('R2_ACCOUNT_ID is required');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID     || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
  });
}

async function listObjects(s3, bucket, prefix) {
  const keys = [];
  let continuationToken;
  do {
    const resp = await s3.send(new ListObjectsV2Command({
      Bucket:            bucket,
      Prefix:            prefix,
      ContinuationToken: continuationToken,
    }));
    for (const obj of resp.Contents || []) keys.push(obj.Key);
    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function getIndexJson(s3, bucket) {
  try {
    const resp = await s3.send(new GetObjectCommand({
      Bucket: bucket,
      Key:    `${CACHE_PREFIX}/index.json`,
    }));
    const body = await resp.Body.transformToString();
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function run() {
  const args   = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const print  = args.includes('--print');

  const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
  const missing  = required.filter(v => !process.env[v]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);

  const bucket = process.env.R2_BUCKET;
  const s3     = buildS3Client();

  if (print) {
    const current = await getIndexJson(s3, bucket);
    console.log(JSON.stringify(current, null, 2));
    return;
  }

  // List all metadata.json keys to discover processed periods
  const monthlyKeys = await listObjects(s3, bucket, `${CACHE_PREFIX}/monthly/`);
  const yearlyKeys  = await listObjects(s3, bucket, `${CACHE_PREFIX}/yearly/`);

  // Extract periods from metadata.json paths: satellite-cache/monthly/YYYY-MM/metadata.json
  const monthlyPeriods = monthlyKeys
    .filter(k => k.endsWith('/metadata.json'))
    .map(k => k.replace(`${CACHE_PREFIX}/monthly/`, '').replace('/metadata.json', ''))
    .filter(p => /^\d{4}-\d{2}$/.test(p))
    .sort();

  const yearlyPeriods = yearlyKeys
    .filter(k => k.endsWith('/metadata.json'))
    .map(k => k.replace(`${CACHE_PREFIX}/yearly/`, '').replace('/metadata.json', ''))
    .filter(p => /^\d{4}$/.test(p))
    .sort();

  const index = {
    latest_month: monthlyPeriods.at(-1) ?? null,
    latest_year:  yearlyPeriods.at(-1)  ?? null,
    monthly:      monthlyPeriods,
    yearly:       yearlyPeriods,
  };

  console.log('Rebuilt index:', JSON.stringify(index, null, 2));

  if (dryRun) {
    console.log('[dry-run] Not uploading.');
    return;
  }

  const indexKey = `${CACHE_PREFIX}/index.json`;
  await s3.send(new PutObjectCommand({
    Bucket:       bucket,
    Key:          indexKey,
    Body:         JSON.stringify(index, null, 2),
    ContentType:  'application/json',
    CacheControl: 'public, max-age=300',
  }));
  console.log(`✅ index.json uploaded to s3://${bucket}/${indexKey}`);
}

run().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});

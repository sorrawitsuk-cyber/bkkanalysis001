#!/usr/bin/env node
/**
 * Manual R2 upload utility.
 *
 * Usage:
 *   node scripts/storage/upload-r2.mjs <local-file-path> <r2-object-key>
 *
 * Environment variables:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *
 * Examples:
 *   node scripts/storage/upload-r2.mjs ./output/ndvi_mean.tif satellite-cache/monthly/2024-01/ndvi_mean.tif
 *   node scripts/storage/upload-r2.mjs ./index.json satellite-cache/index.json
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import { existsSync, statSync } from 'fs';

const MIME_TYPES = {
  '.tif':  'image/tiff',
  '.tiff': 'image/tiff',
  '.webp': 'image/webp',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json',
  '.geojson': 'application/geo+json',
};

function getMimeType(filePath) {
  return MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

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

async function uploadFile(localPath, r2Key) {
  const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
  const missing  = required.filter(v => !process.env[v]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);

  if (!existsSync(localPath)) throw new Error(`File not found: ${localPath}`);

  const data        = await readFile(localPath);
  const contentType = getMimeType(localPath);
  const bucket      = process.env.R2_BUCKET;
  const s3          = buildS3Client();

  const size = statSync(localPath).size;
  console.log(`Uploading ${localPath} (${(size / 1024).toFixed(1)} KB) → s3://${bucket}/${r2Key}`);

  await s3.send(new PutObjectCommand({
    Bucket:       bucket,
    Key:          r2Key,
    Body:         data,
    ContentType:  contentType,
    CacheControl: 'public, max-age=86400',
  }));

  const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  console.log(`✅ Uploaded successfully`);
  if (publicBaseUrl) console.log(`   Public URL: ${publicBaseUrl}/${r2Key}`);
}

// Main
const [, , localPath, r2Key] = process.argv;
if (!localPath || !r2Key) {
  console.error('Usage: node upload-r2.mjs <local-file> <r2-key>');
  process.exit(1);
}

uploadFile(localPath, r2Key).catch(err => {
  console.error('❌ Upload failed:', err.message);
  process.exit(1);
});

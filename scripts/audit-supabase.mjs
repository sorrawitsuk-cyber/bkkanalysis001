import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) process.env[match[1].trim()] = match[2].trim();
    });
  }
}

loadEnv();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// First get column names
const { data: sample, error: sampleErr } = await supabase
  .from('district_statistics')
  .select('*')
  .limit(1);

if (sampleErr) { console.error('Error:', sampleErr.message); process.exit(1); }
console.log('Columns:', Object.keys(sample[0] || {}).join(', '));

const { data, error } = await supabase
  .from('district_statistics')
  .select('*')
  .order('year', { ascending: true });

if (error) { console.error('Error:', error.message); process.exit(1); }

console.log(`\nTotal rows: ${data.length}`);
const byYear = {};
for (const row of data) {
  if (!byYear[row.year]) byYear[row.year] = { total: 0, ndvi: 0, lst: 0, ndbi: 0, water: 0, ntl: 0 };
  byYear[row.year].total++;
  if (row.ndvi_mean != null) byYear[row.year].ndvi++;
  if (row.lst_mean != null || row.mean_lst != null) byYear[row.year].lst++;
  if (row.ndbi_mean != null) byYear[row.year].ndbi++;
  if (row.water_ratio != null) byYear[row.year].water++;
  if (row.ntl_mean != null) byYear[row.year].ntl++;
}

const years = Object.keys(byYear).sort((a, b) => Number(a) - Number(b));
console.log('\nYear | Districts | NDVI | LST | NDBI | Water | NTL');
console.log('-----|-----------|------|-----|------|-------|----');
for (const year of years) {
  const y = byYear[year];
  console.log(`${year} | ${y.total.toString().padStart(9)} | ${y.ndvi.toString().padStart(4)} | ${y.lst.toString().padStart(3)} | ${y.ndbi.toString().padStart(4)} | ${y.water.toString().padStart(5)} | ${y.ntl}`);
}

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

// Check districts table
const { data: districts, error: dErr } = await supabase.from('districts').select('id, name_th').order('id');
if (dErr) { console.error('districts error:', dErr.message); }
else {
  console.log(`districts table: ${districts.length} rows`);
  console.log('First 5:', districts.slice(0, 5));
  console.log('Last 5:', districts.slice(-5));
}

// Check district_statistics sample
const { data: stats, error: sErr } = await supabase
  .from('district_statistics')
  .select('district_id, year, ndvi_mean, ndbi_mean')
  .eq('year', 2024)
  .order('district_id')
  .limit(5);
if (sErr) { console.error('stats error:', sErr.message); }
else {
  console.log('\ndistrict_statistics 2024 (first 5):');
  console.table(stats);
}

// Check GeoJSON district IDs
const geojson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/data/bkk_districts.json'), 'utf8'));
console.log('\nGeoJSON districts (first 5):');
geojson.features.slice(0, 5).forEach(f => console.log(`  id=${f.properties.id} name=${f.properties.name_th}`));

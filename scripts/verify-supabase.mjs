import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=][^=]*)=(.*)$/);
    if (!m) return;
    const val = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    process.env[m[1].trim()] = val;
  });
}
loadEnv();

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await sb.from('district_statistics')
  .select('year, water_ratio, mean_lst, ntl_mean, green_area_ratio');
if (error) { console.error(error); process.exit(1); }

const byYear = {};
data.forEach(r => {
  if (!byYear[r.year]) byYear[r.year] = { water: 0, lst: 0, ntl: 0, green: 0, total: 0 };
  byYear[r.year].total++;
  if (r.water_ratio != null) byYear[r.year].water++;
  if (r.mean_lst != null) byYear[r.year].lst++;
  if (r.ntl_mean != null) byYear[r.year].ntl++;
  if (r.green_area_ratio != null) byYear[r.year].green++;
});

console.log('Year  | water | lst | ntl | green | total');
Object.entries(byYear).sort().forEach(([y, v]) =>
  console.log(`${y}  |  ${v.water}   | ${v.lst} | ${v.ntl} | ${v.green}   | ${v.total}`)
);
process.exit(0);

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim();
      }
    });
  }
}

async function reseed() {
  loadEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("1. Clearing ALL data in 'districts' (Aggressive)...");
  // Delete all rows by using a condition that is always true
  const { error: delError } = await supabase.from('districts').delete().neq('id', -1);
  if (delError) {
      console.error("Delete failed:", delError.message);
  } else {
      console.log("Successfully cleared districts table.");
  }

  const geojsonPath = path.join(process.cwd(), 'src', 'data', 'bkk_districts.geojson');
  const data = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));

  console.log(`2. Seeding ${data.features.length} REAL districts...`);

  for (const feature of data.features) {
    const props = feature.properties;
    const row = {
      name_th: props.name_th,
      name_en: props.name_en,
      population: props.population,
      growth_rate: props.growth_rate,
      density: props.density,
      accessibility_index: props.accessibility_index,
      blind_spots: props.blind_spots,
      geom: feature.geometry
    };

    const { error } = await supabase.from('districts').insert(row);
    if (error) {
      console.error(`Failed ${props.name_en}:`, error.message);
      // Fallback
      await supabase.from('districts').insert({ ...row, geom: JSON.stringify(feature.geometry) });
    } else {
      console.log(`Inserted ${props.name_en}`);
    }
  }
  
  console.log("Seeding finished.");
}

reseed();

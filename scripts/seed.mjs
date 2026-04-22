import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Simple .env.local parser
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

async function seed() {
  loadEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const geojsonPath = path.join(process.cwd(), 'src', 'data', 'bkk_districts.geojson');
  const data = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));

  console.log(`Starting to seed ${data.features.length} districts to Supabase...`);

  // Clear existing data (optional but good for clean seed)
  console.log("Clearing existing data...");
  const { error: deleteError } = await supabase.from('districts').delete().gt('id', 0);
  if(deleteError) console.log("Note: Could not clear existing data.", deleteError.message);

  for (const feature of data.features) {
    const props = feature.properties;
    
    // To insert PostGIS geometry via Supabase JS client, we can pass the GeoJSON geometry object directly.
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
      console.error(`Error inserting ${props.name_en}:`, error.message);
      // Fallback: If inserting as object fails, sometimes it requires a string representation
      if (error.message.includes("geometry")) {
         console.log("Retrying geometry insertion as string...");
         const rowFallback = { ...row, geom: JSON.stringify(feature.geometry) };
         const { error: err2 } = await supabase.from('districts').insert(rowFallback);
         if (err2) console.error("Fallback failed:", err2.message);
         else console.log(`Inserted ${props.name_en} (Fallback success)`);
      }
    } else {
      console.log(`Inserted ${props.name_en}`);
    }
  }
  
  console.log("Seeding complete!");
}

seed();

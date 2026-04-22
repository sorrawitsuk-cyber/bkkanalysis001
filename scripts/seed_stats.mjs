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

async function seedStats() {
  loadEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch all districts to get their IDs
  const { data: districts, error: fetchError } = await supabase.from('districts').select('id, population, density');
  if (fetchError || !districts) {
    console.error("Could not fetch districts. Make sure they are seeded first.", fetchError?.message);
    return;
  }

  console.log(`Generating 5-year statistics for ${districts.length} districts...`);

  const records = [];
  const currentYear = 2024;

  districts.forEach(dist => {
    let basePop = dist.population || 50000;
    let baseDensity = dist.density || 4000;
    
    for (let year = currentYear - 4; year <= currentYear; year++) {
      basePop -= Math.floor(Math.random() * 1000); // go backwards
      baseDensity -= Math.floor(Math.random() * 50);

      records.push({
        district_id: dist.id,
        year: year,
        population: basePop,
        density: baseDensity,
        growth_rate: parseFloat((Math.random() * 2).toFixed(2)),
        accessibility_index: parseFloat((Math.random() * 10).toFixed(1)),
        ndvi_score: parseFloat((Math.random() * 8).toFixed(2))
      });
    }
  });

  console.log(`Uploading ${records.length} records to 'district_statistics'...`);
  const { error: insertError } = await supabase.from('district_statistics').insert(records);
  
  if (insertError) {
    console.error("Error seeding statistics:", insertError.message);
    console.log("Tip: Make sure you have run the statistics_schema.sql and disabled RLS on 'district_statistics'.");
  } else {
    console.log("Statistics seeding complete! Your dashboard graphs should now work.");
  }
}

seedStats();

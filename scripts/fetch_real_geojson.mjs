import fs from 'fs';
import path from 'path';
import https from 'https';

const url = 'https://raw.githubusercontent.com/apisit/thailand.json/master/thai_amphoes.geojson';
const outputPath = path.join(process.cwd(), 'src', 'data', 'bkk_districts.geojson');

console.log('Downloading real GeoJSON for Thailand...');

https.get(url, (res) => {
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  
  res.on('end', () => {
    console.log('Download complete. Parsing and filtering for Bangkok...');
    try {
      const allAmphoes = JSON.parse(body);
      
      // Filter for Bangkok (usually PROV_CODE '10' or by name)
      // apisit/thailand.json uses 'PROV_CODE' === '10' or 'PROV_NAMT' === 'กรุงเทพมหานคร'
      let bkkFeatures = allAmphoes.features.filter(f => 
        f.properties.PROV_NAMT === 'กรุงเทพมหานคร' || 
        f.properties.PROV_CODE === '10' ||
        (f.properties.name && f.properties.name.includes('Bangkok'))
      );

      if (bkkFeatures.length === 0) {
          console.error("Could not find Bangkok districts in the data.");
          return;
      }

      console.log(`Found ${bkkFeatures.length} districts for Bangkok.`);

      // Format properties to match our schema and add dummy stats
      const formattedFeatures = bkkFeatures.map((feature, index) => {
        const name_th = feature.properties.AMP_NAMT || feature.properties.name || `เขต ${index+1}`;
        const name_en = feature.properties.AMP_NAME || feature.properties.name_en || `District ${index+1}`;
        
        const randomPop = Math.floor(Math.random() * 150000) + 30000;
        const randomGrowth = parseFloat((Math.random() * 5 - 2).toFixed(2));
        const randomDensity = Math.floor(Math.random() * 12000) + 1000;
        const randomAccess = parseFloat((Math.random() * 10).toFixed(1));
        const randomBlind = Math.floor(Math.random() * 8);

        return {
          type: "Feature",
          properties: {
            id: index + 1,
            name_th: name_th.replace('เขต', '').trim(), // Remove 'เขต' prefix if present to standardize
            name_en: name_en.replace('Khet ', '').trim(),
            population: randomPop,
            growth_rate: randomGrowth,
            density: randomDensity,
            accessibility_index: randomAccess,
            blind_spots: randomBlind
          },
          geometry: feature.geometry
        };
      });

      const finalGeoJSON = {
        type: "FeatureCollection",
        name: "bkk_real_districts",
        crs: allAmphoes.crs || { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
        features: formattedFeatures
      };

      fs.writeFileSync(outputPath, JSON.stringify(finalGeoJSON), 'utf8');
      console.log(`Successfully saved real Bangkok GeoJSON to ${outputPath}`);
      
    } catch (e) {
      console.error("Error parsing GeoJSON:", e);
    }
  });
}).on('error', (e) => {
  console.error('Error downloading:', e);
});

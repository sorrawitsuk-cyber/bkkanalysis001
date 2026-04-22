import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import osmtogeojson from 'osmtogeojson';

const overpassUrl = 'https://overpass-api.de/api/interpreter';

// Query to get all districts (admin_level=6) within Bangkok
const overpassQuery = `
[out:json][timeout:60];
area["name:en"="Bangkok"]->.bkk;
relation["admin_level"="6"](area.bkk);
out geom;
`;

const outputPath = path.join(process.cwd(), 'src', 'data', 'bkk_districts.geojson');

async function fetchRealDistricts() {
    console.log("Fetching real Bangkok district boundaries from OpenStreetMap (Overpass API)...");
    
    try {
        const response = await fetch(overpassUrl, {
            method: 'POST',
            body: overpassQuery,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const osmData = await response.json();
        console.log(`Received data. Converting to GeoJSON...`);

        const geojson = osmtogeojson(osmData);

        // Filter and map properties
        const features = geojson.features.filter(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon').map((feature, index) => {
            const nameTh = feature.properties['name:th'] || feature.properties.name || `เขต ${index + 1}`;
            const nameEn = feature.properties['name:en'] || `District ${index + 1}`;

            // Add dummy data for analytics
            const randomPop = Math.floor(Math.random() * 150000) + 30000;
            const randomGrowth = parseFloat((Math.random() * 5 - 2).toFixed(2));
            const randomDensity = Math.floor(Math.random() * 12000) + 1000;
            const randomAccess = parseFloat((Math.random() * 10).toFixed(1));
            const randomBlind = Math.floor(Math.random() * 8);

            return {
                type: "Feature",
                properties: {
                    id: index + 1,
                    name_th: nameTh.replace('เขต', '').trim(),
                    name_en: nameEn.replace('Khet ', '').trim(),
                    population: randomPop,
                    growth_rate: randomGrowth,
                    density: randomDensity,
                    accessibility_index: randomAccess,
                    blind_spots: randomBlind
                },
                geometry: feature.geometry
            };
        });

        console.log(`Extracted ${features.length} real districts.`);

        const finalGeoJSON = {
            type: "FeatureCollection",
            name: "bkk_districts",
            features: features
        };

        fs.writeFileSync(outputPath, JSON.stringify(finalGeoJSON, null, 2), 'utf8');
        console.log(`Saved real boundaries to ${outputPath}!`);

    } catch (error) {
        console.error("Error fetching or processing data:", error);
    }
}

fetchRealDistricts();

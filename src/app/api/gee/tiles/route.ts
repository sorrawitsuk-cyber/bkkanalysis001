import { NextResponse } from 'next/server';
import ee, { initGEE } from '@/lib/gee';
import bkkBoundaryData from '@/data/bkk_districts.geojson';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') || '2024', 10);
  const isCompare = searchParams.get('compare') === 'true';
  const baselineYear = parseInt(searchParams.get('baseline') || '2018', 10);

  try {
    await initGEE();

    // 1. Load BKK Boundary using direct import so Vercel bundles it
    const bkkBoundary = ee.FeatureCollection(bkkBoundaryData).geometry();

    /**
     * Helper to get LST image for a specific year
     */
    const getLSTImage = (y: number) => {
      // Use Landsat 9 for newer data, Landsat 8 for older
      const collectionId = y >= 2022 ? "LANDSAT/LC09/C02/T1_L2" : "LANDSAT/LC08/C02/T1_L2";
      
      const collection = ee.ImageCollection(collectionId)
        .filterBounds(bkkBoundary)
        .filterDate(`${y}-01-01`, `${y}-12-31`)
        .filter(ee.Filter.lt('CLOUD_COVER', 20));

      // Use median to remove clouds/artifacts
      const image = collection.median().clip(bkkBoundary);
      
      // ST_B10 is Surface Temperature band (Kelvin)
      // Scale: 0.00341802, Offset: 149.0
      return image.select('ST_B10')
        .multiply(0.00341802)
        .add(149.0)
        .subtract(273.15);
    };

    let resultImage;
    let visParams;

    if (isCompare) {
      // Anomaly Mode: current - baseline
      const current = getLSTImage(year);
      const baseline = getLSTImage(baselineYear);
      resultImage = current.subtract(baseline);
      
      visParams = {
        min: -3,
        max: 3,
        palette: ['#2166AC', '#67A9CF', '#F7F7F7', '#EF8A62', '#B2182B']
      };
    } else {
      // Standard LST Mode
      resultImage = getLSTImage(year);
      
      visParams = {
        min: 25,
        max: 45,
        palette: ['#FFEDA0', '#FED976', '#FD8D3C', '#E31A1C', '#BD0026', '#800026']
      };
    }

    // Get Map ID from GEE
    const mapIdData: any = await new Promise((resolve, reject) => {
      resultImage.getMapId(visParams, (data: any, err: any) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    return NextResponse.json({
      urlFormat: mapIdData.urlFormat,
      mapid: mapIdData.mapid,
      token: mapIdData.token
    });

  } catch (error: any) {
    console.error('❌ GEE API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

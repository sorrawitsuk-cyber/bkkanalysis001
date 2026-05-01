import { NextResponse } from 'next/server';
import ee, { initGEE } from '@/lib/gee';
import bkkBoundaryData from '@/data/bkk_districts.json';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // Handle 'null' or 'NaN' strings from frontend
  const yearParam = searchParams.get('year');
  const baselineParam = searchParams.get('baseline');
  
  const year = yearParam && yearParam !== 'null' ? parseInt(yearParam, 10) : 2024;
  const baselineYear = baselineParam && baselineParam !== 'null' ? parseInt(baselineParam, 10) : 2018;
  const isCompare = searchParams.get('compare') === 'true';
  const metric = searchParams.get('metric') === 'vegetation' ? 'vegetation' : 'lst';

  try {
    await initGEE();

    // 1. Load BKK Boundary using direct import so Vercel bundles it
    const bkkBoundary = ee.FeatureCollection(bkkBoundaryData).geometry();

    /**
     * Helper to get LST image for a specific year
     */
    const getLandsatImage = (y: number) => {
      // Use Landsat 9 for newer data, Landsat 8 for older
      const collectionId = y >= 2022 ? "LANDSAT/LC09/C02/T1_L2" : "LANDSAT/LC08/C02/T1_L2";
      
      const currentYear = new Date().getFullYear();
      const today = new Date().toISOString().split('T')[0];
      const startDate = `${y}-01-01`;
      const endDate = y === currentYear ? today : `${y}-12-31`;

      const collection = ee.ImageCollection(collectionId)
        .filterBounds(bkkBoundary)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUD_COVER', 20));

      // Use median to remove clouds/artifacts
      return collection.median().clip(bkkBoundary);
    };

    const getMetricImage = (y: number) => {
      const image = getLandsatImage(y);

      if (metric === 'vegetation') {
        const nir = image.select('SR_B5').multiply(0.0000275).add(-0.2);
        const red = image.select('SR_B4').multiply(0.0000275).add(-0.2);
        return nir.subtract(red).divide(nir.add(red)).rename('NDVI');
      }

      // ST_B10 is Surface Temperature band (Kelvin)
      // Scale: 0.00341802, Offset: 149.0
      return image.select('ST_B10').multiply(0.00341802).add(149.0).subtract(273.15);
    };

    let resultImage;
    let visParams;

    if (isCompare) {
      // Anomaly Mode: current - baseline
      const current = getMetricImage(year);
      const baseline = getMetricImage(baselineYear);
      resultImage = current.subtract(baseline);
      
      visParams = metric === 'vegetation'
        ? { min: -0.2, max: 0.2, palette: ['#8B1E1E', '#F59E0B', '#F7F7F7', '#86EFAC', '#047857'] }
        : { min: -3, max: 3, palette: ['#2166AC', '#67A9CF', '#F7F7F7', '#EF8A62', '#B2182B'] };
    } else {
      resultImage = getMetricImage(year);
      
      visParams = metric === 'vegetation'
        ? { min: 0.1, max: 0.8, palette: ['#7F1D1D', '#B45309', '#FACC15', '#84CC16', '#16A34A', '#065F46'] }
        : { min: 25, max: 45, palette: ['#FFEDA0', '#FED976', '#FD8D3C', '#E31A1C', '#BD0026', '#800026'] };
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
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800'
      }
    });

  } catch (error: any) {
    console.error('❌ GEE API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

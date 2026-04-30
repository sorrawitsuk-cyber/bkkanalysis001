import { NextResponse } from 'next/server';
import ee, { initGEE } from '@/lib/gee';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') || '0');
  const lng = parseFloat(searchParams.get('lng') || '0');
  const year = parseInt(searchParams.get('year') || '2024', 10);

  if (!lat || !lng) {
    return NextResponse.json({ error: 'Missing coordinates' }, { status: 400 });
  }

  try {
    await initGEE();

    // 1. Define Point
    const point = ee.Geometry.Point([lng, lat]);

    // 2. Load Landsat (Same logic as tiles)
    const collectionId = year >= 2022 ? 'LANDSAT/LC09/C02/T1_L2' : 'LANDSAT/LC08/C02/T1_L2';
    const currentYear = new Date().getFullYear();
    const today = new Date().toISOString().split('T')[0];
    const startDate = `${year}-01-01`;
    const endDate = year === currentYear ? today : `${year}-12-31`;

    const getLST = (image: any) => {
      const kelvin = image.select('ST_B10').multiply(0.00341802).add(149.0);
      const celsius = kelvin.subtract(273.15);
      return celsius.rename('LST').copyProperties(image, image.propertyNames());
    };

    const collection = ee.ImageCollection(collectionId)
      .filterBounds(point)
      .filterDate(startDate, endDate)
      .filter(ee.Filter.lt('CLOUD_COVER', 20));

    if (collection.size().getInfo() === 0) {
      return NextResponse.json({ error: 'No satellite data found for this location/year' }, { status: 404 });
    }

    const lstImage = getLST(collection.median());

    // 3. Sample the value at the point
    const result = lstImage.reduceRegion({
      reducer: ee.Reducer.first(),
      geometry: point,
      scale: 30,
    }).getInfo();

    return NextResponse.json({ 
      temp: result.LST ? parseFloat(result.LST.toFixed(2)) : null,
      lat,
      lng,
      year
    });

  } catch (error: any) {
    console.error('❌ GEE Point Query Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

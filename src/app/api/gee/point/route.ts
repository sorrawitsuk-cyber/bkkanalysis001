import { NextResponse } from 'next/server';
import ee, { initGEE } from '@/lib/gee';

function evaluateEe<T>(eeObject: any): Promise<T> {
  return new Promise((resolve, reject) => {
    eeObject.evaluate((value: T, error: any) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') || '0');
  const lng = parseFloat(searchParams.get('lng') || '0');
  const year = parseInt(searchParams.get('year') || '2024', 10);
  const baselineYear = parseInt(searchParams.get('baseline') || '2018', 10);
  const isCompare = searchParams.get('compare') === 'true';
  const metricParam = searchParams.get('metric');
  const metric = metricParam === 'vegetation' ? 'vegetation' : metricParam === 'builtup' ? 'builtup' : metricParam === 'nightlights' ? 'nightlights' : metricParam === 'air_pollution' ? 'air_pollution' : 'lst';
  const pollutantParam = searchParams.get('pollutant');
  const pollutant = pollutantParam === 'co' ? 'co' : pollutantParam === 'so2' ? 'so2' : pollutantParam === 'aerosol' ? 'aerosol' : 'no2';
  const nightLightsProduct = searchParams.get('product') === 'monthly' ? 'monthly' : 'annual';
  const nightLightsMonth = Math.max(1, Math.min(3, parseInt(searchParams.get('month') || '3', 10)));

  if (!lat || !lng) {
    return NextResponse.json({ error: 'Missing coordinates' }, { status: 400 });
  }

  // Sentinel-5P TROPOMI available from 2018 only
  const S5P_MIN_YEAR = 2018;
  if (metric === 'air_pollution' && year < S5P_MIN_YEAR) {
    return NextResponse.json(
      { error: `Sentinel-5P TROPOMI ไม่มีข้อมูลก่อนปี ${S5P_MIN_YEAR}` },
      { status: 400 }
    );
  }

  try {
    await initGEE();

    // 1. Define Point
    const point = ee.Geometry.Point([lng, lat]);

    const today = new Date().toISOString().split('T')[0];
    const todayMMDD = today.slice(5); // "MM-DD"
    const currentYear = new Date().getFullYear();

    const getDateRange = (targetYear: number, endMMDD = '12-31') => ({
      startDate: `${targetYear}-01-01`,
      endDate: `${targetYear}-${targetYear >= currentYear ? todayMMDD : endMMDD}`,
    });

    const waterMask = ee.Image("JRC/GSW1_4/GlobalSurfaceWater")
      .select("occurrence")
      .gte(50)
      .not()
      .unmask(1);

    const maskSentinel2 = (image: any) => {
      const scl = image.select('SCL');
      const clearMask = scl
        .neq(0)
        .and(scl.neq(1))
        .and(scl.neq(3))
        .and(scl.neq(8))
        .and(scl.neq(9))
        .and(scl.neq(10))
        .and(scl.neq(11));
      return image.updateMask(clearMask);
    };

    const getSentinelNdviImage = (targetYear: number, endMMDD = '12-31') => {
      const { startDate, endDate } = getDateRange(targetYear, endMMDD);
      return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(point)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
        .map(maskSentinel2)
        .map((image: any) => {
          const nir = image.select('B8').divide(10000);
          const red = image.select('B4').divide(10000);
          return nir.subtract(red).divide(nir.add(red)).rename('NDVI');
        })
        .median()
        .updateMask(waterMask);
    };

    const getSentinelNdbiImage = (targetYear: number, endMMDD = '12-31') => {
      const { startDate, endDate } = getDateRange(targetYear, endMMDD);
      return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(point)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
        .map(maskSentinel2)
        .map((image: any) => {
          const swir = image.select('B11').divide(10000);
          const nir = image.select('B8').divide(10000);
          return swir.subtract(nir).divide(swir.add(nir)).rename('NDBI');
        })
        .median()
        .updateMask(waterMask);
    };

    const getLandsatLSTImage = (targetYear: number, endMMDD = '12-31') => {
      const { startDate, endDate } = getDateRange(targetYear, endMMDD);
      const lc08 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2');
      const collection = (targetYear >= 2022 ? lc08.merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')) : lc08)
        .filterBounds(point)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUD_COVER', 20));

      const landsatImg = collection.median();
      const bt = landsatImg.select('ST_B10').multiply(0.00341802).add(149.0); // Kelvin

      // NDVI-based emissivity (Sobrino et al. 2004) at 30m to match Landsat
      const ndviForEmis = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(point)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
        .map(maskSentinel2)
        .map((img: any) => {
          const nir = img.select('B8').divide(10000);
          const red = img.select('B4').divide(10000);
          return nir.subtract(red).divide(nir.add(red)).rename('NDVI');
        })
        .median()
        .reproject({ crs: 'EPSG:4326', scale: 30 });

      const pv = ndviForEmis.subtract(0.2).divide(0.3).clamp(0, 1).pow(2);
      const emissivity = pv.multiply(0.004).add(0.986);
      const lambda = 10.895;
      const rho = 14380;
      const lstK = bt.divide(
        ee.Image(1).add(bt.multiply(lambda / rho).multiply(emissivity.log()))
      );
      return lstK.subtract(273.15).rename('LST');
    };

    const getNightLightsImage = (targetYear: number) => {
      if (nightLightsProduct === 'monthly') {
        const cappedYear = Math.max(2014, Math.min(2025, targetYear));
        const endDate = nightLightsMonth === 12 ? `${cappedYear + 1}-01-01` : `${cappedYear}-${String(nightLightsMonth + 1).padStart(2, '0')}-01`;
        return ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG')
          .filterBounds(point)
          .filterDate(`${cappedYear}-${String(nightLightsMonth).padStart(2, '0')}-01`, endDate)
          .map((image: any) => image
            .select('avg_rad')
            .max(0)
            .rename('NTL')
            .updateMask(image.select('cf_cvg').gte(3)))
          .mean()
          .rename('NTL');
      }

      const cappedYear = Math.max(2014, Math.min(2024, targetYear));
      return ee.ImageCollection('NOAA/VIIRS/DNB/ANNUAL_V22')
        .filterBounds(point)
        .filterDate(`${cappedYear}-01-01`, `${cappedYear + 1}-01-01`)
        .first()
        .select('average_masked')
        .max(0)
        .rename('NTL');
    };

    const getAirPollutionImage = (targetYear: number, endMMDD = '12-31') => {
      const { startDate, endDate } = getDateRange(targetYear, endMMDD);
      if (pollutant === 'co') {
        return ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_CO')
          .filterBounds(point)
          .filterDate(startDate, endDate)
          .select('CO_column_number_density')
          .mean()
          .rename('AIR');
      }
      if (pollutant === 'so2') {
        return ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_SO2')
          .filterBounds(point)
          .filterDate(startDate, endDate)
          .select('SO2_column_number_density')
          .mean()
          .rename('AIR');
      }
      if (pollutant === 'aerosol') {
        return ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_AER_AI')
          .filterBounds(point)
          .filterDate(startDate, endDate)
          .select('absorbing_aerosol_index')
          .mean()
          .rename('AIR');
      }
      return ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_NO2')
        .filterBounds(point)
        .filterDate(startDate, endDate)
        .select('tropospheric_NO2_column_number_density')
        .mean()
        .rename('AIR');
    };

    const { startDate, endDate } = getDateRange(year);
    const collection = metric === 'vegetation' || metric === 'builtup'
      ? ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
          .filterBounds(point)
          .filterDate(startDate, endDate)
          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
      : metric === 'nightlights'
        ? (nightLightsProduct === 'monthly'
          ? ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG')
              .filterBounds(point)
              .filterDate(`${Math.max(2014, Math.min(2025, year))}-${String(nightLightsMonth).padStart(2, '0')}-01`, nightLightsMonth === 12 ? `${Math.max(2014, Math.min(2025, year)) + 1}-01-01` : `${Math.max(2014, Math.min(2025, year))}-${String(nightLightsMonth + 1).padStart(2, '0')}-01`)
          : ee.ImageCollection('NOAA/VIIRS/DNB/ANNUAL_V22')
            .filterBounds(point)
            .filterDate(`${Math.max(2014, Math.min(2024, year))}-01-01`, `${Math.max(2014, Math.min(2024, year)) + 1}-01-01`))
      : metric === 'air_pollution'
        ? ee.ImageCollection(
            pollutant === 'co'
              ? 'COPERNICUS/S5P/OFFL/L3_CO'
              : pollutant === 'so2'
                ? 'COPERNICUS/S5P/OFFL/L3_SO2'
                : pollutant === 'aerosol'
                  ? 'COPERNICUS/S5P/OFFL/L3_AER_AI'
                  : 'COPERNICUS/S5P/OFFL/L3_NO2'
          )
          .filterBounds(point)
          .filterDate(startDate, endDate)
      : (year >= 2022
          ? ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
          : ee.ImageCollection('LANDSAT/LC08/C02/T1_L2'))
          .filterBounds(point)
          .filterDate(startDate, endDate)
          .filter(ee.Filter.lt('CLOUD_COVER', 20));

    const imageCount = await evaluateEe<number>(collection.size());
    if (!imageCount) {
      return NextResponse.json({ error: 'No satellite data found for this location/year' }, { status: 404 });
    }

    const currentImage = metric === 'vegetation' ? getSentinelNdviImage(year, todayMMDD) : metric === 'builtup' ? getSentinelNdbiImage(year, todayMMDD) : metric === 'nightlights' ? getNightLightsImage(year) : metric === 'air_pollution' ? getAirPollutionImage(year, todayMMDD) : getLandsatLSTImage(year, todayMMDD);
    const metricImage = isCompare
      ? currentImage.subtract(metric === 'vegetation' ? getSentinelNdviImage(baselineYear, todayMMDD) : metric === 'builtup' ? getSentinelNdbiImage(baselineYear, todayMMDD) : metric === 'nightlights' ? getNightLightsImage(baselineYear) : metric === 'air_pollution' ? getAirPollutionImage(baselineYear, todayMMDD) : getLandsatLSTImage(baselineYear, todayMMDD))
      : currentImage;

    // 3. Sample the value at the point
    const result = await evaluateEe<Record<string, number | null>>(metricImage.reduceRegion({
      reducer: ee.Reducer.first(),
      geometry: point,
      scale: metric === 'vegetation' ? 10 : metric === 'nightlights' || metric === 'air_pollution' ? 1000 : 30,
      bestEffort: true,
    }));

    const value = metric === 'vegetation' ? result.NDVI : metric === 'builtup' ? result.NDBI : metric === 'nightlights' ? result.NTL : metric === 'air_pollution' ? result.AIR : result.LST;

    return NextResponse.json({
      temp: value !== null && value !== undefined ? parseFloat(value.toFixed(metric === 'vegetation' || metric === 'nightlights' ? 3 : metric === 'air_pollution' ? 6 : 2)) : null,
      metric,
      lat,
      lng,
      year,
      baselineYear: isCompare ? baselineYear : null,
      compare: isCompare,
      sceneCount: imageCount,
      lowSceneWarning: imageCount < 5,
      dataSource: metric === 'vegetation'
        ? 'Sentinel-2 SR Harmonized yearly median NDVI'
        : metric === 'builtup'
          ? 'Sentinel-2 SR Harmonized yearly median NDBI'
          : metric === 'nightlights'
            ? nightLightsProduct === 'monthly' ? 'VIIRS DNB monthly avg_rad preview' : 'VIIRS DNB Annual V2.2 average_masked'
            : metric === 'air_pollution'
              ? `Sentinel-5P OFFL yearly mean ${pollutant.toUpperCase()} (ความละเอียด 1,000m — ตีความระดับเขตด้วยความระมัดระวัง)`
            : 'Landsat 8/9 C2 L2 yearly median LST (emissivity-corrected)',
      resolutionMeters: metric === 'vegetation' || metric === 'builtup' ? 10 : metric === 'nightlights' || metric === 'air_pollution' ? 1000 : 30
    });

  } catch (error: any) {
    console.error('❌ GEE Point Query Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

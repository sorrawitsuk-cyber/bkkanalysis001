/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import geojson from "@/data/bkk_districts.json";
import ee, { initGEE } from "@/lib/gee";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`GEE timeout after ${ms}ms`)), ms)
    ),
  ]);
}

function evaluateEe<T>(eeObject: any): Promise<T> {
  return new Promise((resolve, reject) => {
    eeObject.evaluate((value: T, error: any) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
}

function getDistrictFeatureCollection() {
  return ee.FeatureCollection(
    (geojson.features as any[]).map((feature: any) =>
      ee.Feature(ee.Geometry(feature.geometry).simplify(250), {
        id: feature.properties.id,
        name_th: feature.properties.name_th,
      })
    )
  );
}

export async function GET() {
  try {
    await initGEE();

    // JRC GlobalSurfaceWater occurrence >= 70% = permanent water (Chao Phraya + major canals)
    const jrcPermanent = ee.Image("JRC/GSW1_4/GlobalSurfaceWater")
      .select("occurrence")
      .gte(70)
      .unmask(0);

    const districts = getDistrictFeatureCollection();

    const result = await withTimeout(
      evaluateEe<any>(
        jrcPermanent.reduceRegions({
          collection: districts,
          reducer: ee.Reducer.mean(),
          scale: 100,
          tileScale: 2,
        })
      ),
      45000
    );

    const fractions: Record<number, number> = {};
    for (const feat of (result?.features ?? [])) {
      const id = feat?.properties?.id;
      const mean = feat?.properties?.mean;
      if (id != null && typeof mean === "number" && Number.isFinite(mean)) {
        fractions[id] = parseFloat(mean.toFixed(4));
      }
    }

    return NextResponse.json(
      { fractions },
      { headers: { "Cache-Control": "public, max-age=2592000, stale-while-revalidate=86400" } }
    );
  } catch (err) {
    console.error("JRC baseline computation failed:", err);
    return NextResponse.json({ fractions: {}, error: String(err) }, { status: 500 });
  }
}

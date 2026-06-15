/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import populationData from "@/data/bkk_population.json";
import districtGeojson from "@/data/bkk_districts.json";
import subdistrictGeojson from "@/data/bkk_subdistricts.json";
import {
  POPULATION_MAX_YEAR,
  POPULATION_MIN_YEAR,
  type PopulationLevel,
  type PopulationRow,
} from "@/lib/population";
import { normalizePopulationExposure } from "@/lib/urban-impact";

export const dynamic = "force-dynamic";

type AnnualRecord = {
  year: number;
  male: number;
  female: number;
  population: number;
  houses: number;
};

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function aggregateRecords(records: AnnualRecord[]) {
  return records.reduce(
    (total, record) => ({
      year: record.year,
      male: total.male + record.male,
      female: total.female + record.female,
      population: total.population + record.population,
      houses: total.houses + record.houses,
    }),
    { year: records[0]?.year ?? 0, male: 0, female: 0, population: 0, houses: 0 },
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = Number.parseInt(searchParams.get("year") || String(POPULATION_MAX_YEAR), 10);
  const level = (searchParams.get("level") || "district") as PopulationLevel;

  if (!Number.isInteger(year) || year < POPULATION_MIN_YEAR || year > POPULATION_MAX_YEAR) {
    return NextResponse.json(
      { error: `year ต้องอยู่ระหว่าง ${POPULATION_MIN_YEAR}-${POPULATION_MAX_YEAR}` },
      { status: 400 },
    );
  }
  if (level !== "district" && level !== "subdistrict") {
    return NextResponse.json({ error: "level ต้องเป็น district หรือ subdistrict" }, { status: 400 });
  }

  const previousYear = year > POPULATION_MIN_YEAR ? year - 1 : null;
  const subdistricts = populationData.subdistricts as Array<{
    id: number;
    district_id: number;
    district_name: string;
    name_th: string;
    name_en: string;
    area_km2: number;
    records: AnnualRecord[];
  }>;
  const selectedTotal = subdistricts.reduce(
    (sum, item) => sum + (item.records.find((record) => record.year === year)?.population ?? 0),
    0,
  );

  let rawRows: Array<{
    id: number;
    name: string;
    name_en: string | null;
    district_id: number;
    district_name: string;
    area_km2: number;
    current: AnnualRecord;
    previous: AnnualRecord | null;
  }>;

  if (level === "subdistrict") {
    rawRows = subdistricts.map((item) => ({
      id: item.id,
      name: item.name_th,
      name_en: item.name_en,
      district_id: item.district_id,
      district_name: item.district_name,
      area_km2: item.area_km2,
      current: item.records.find((record) => record.year === year)!,
      previous: previousYear === null
        ? null
        : item.records.find((record) => record.year === previousYear) ?? null,
    }));
  } else {
    const districtFeatures = districtGeojson.features as any[];
    rawRows = districtFeatures.map((feature) => {
      const districtId = Number(feature.properties.id);
      const children = subdistricts.filter((item) => item.district_id === districtId);
      return {
        id: districtId,
        name: feature.properties.name_th,
        name_en: feature.properties.name_en ?? null,
        district_id: districtId,
        district_name: feature.properties.name_th,
        area_km2: children.reduce((sum, item) => sum + item.area_km2, 0),
        current: aggregateRecords(children.map((item) => item.records.find((record) => record.year === year)!)),
        previous: previousYear === null
          ? null
          : aggregateRecords(children.map((item) => item.records.find((record) => record.year === previousYear)!)),
      };
    });
  }

  const baseRows = rawRows.map((item) => {
    const current = item.current;
    const changeAbs = item.previous ? current.population - item.previous.population : null;
    return {
      id: item.id,
      level,
      name: item.name,
      name_en: item.name_en,
      district_id: item.district_id,
      district_name: item.district_name,
      population: current.population,
      male: current.male,
      female: current.female,
      houses: current.houses,
      area_km2: round(item.area_km2, 3),
      density: item.area_km2 > 0 ? round(current.population / item.area_km2, 1) : 0,
      sex_ratio: current.female > 0 ? round((current.male / current.female) * 100, 1) : null,
      people_per_house: current.houses > 0 ? round(current.population / current.houses, 2) : null,
      change_abs: changeAbs,
      change_pct: item.previous?.population
        ? round((changeAbs! / item.previous.population) * 100, 2)
        : null,
      share_pct: selectedTotal > 0 ? round((current.population / selectedTotal) * 100, 3) : 0,
    };
  });
  const rows: PopulationRow[] = normalizePopulationExposure(baseRows)
    .sort((a, b) => b.population - a.population);

  const rowById = new Map(rows.map((row) => [row.id, row]));
  const baseFeatures = level === "district"
    ? districtGeojson.features as any[]
    : subdistrictGeojson.features as any[];
  const geojson = {
    type: "FeatureCollection" as const,
    features: baseFeatures.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        ...(rowById.get(Number(feature.properties.id)) ?? {}),
      },
    })),
  };

  const trend = Array.from(
    { length: POPULATION_MAX_YEAR - POPULATION_MIN_YEAR + 1 },
    (_, index) => POPULATION_MIN_YEAR + index,
  ).map((trendYear) => aggregateRecords(
    subdistricts.map((item) => item.records.find((record) => record.year === trendYear)!),
  ));
  const total = aggregateRecords(rawRows.map((item) => item.current));
  const previousTotal = previousYear === null
    ? null
    : aggregateRecords(rawRows.map((item) => item.previous!));
  const areaKm2 = rawRows.reduce((sum, item) => sum + item.area_km2, 0);
  const growthRows = rows.filter((row) => row.change_pct !== null).sort(
    (a, b) => (b.change_pct ?? -Infinity) - (a.change_pct ?? -Infinity),
  );
  const densityRows = [...rows].sort((a, b) => b.density - a.density);
  const exposureRows = [...rows].sort((a, b) => b.exposure_score - a.exposure_score);

  return NextResponse.json({
    year,
    previousYear,
    level,
    availableYears: trend.map((record) => record.year),
    rows,
    geojson,
    trend,
    summary: {
      population: total.population,
      male: total.male,
      female: total.female,
      houses: total.houses,
      areaKm2: round(areaKm2, 2),
      density: areaKm2 > 0 ? round(total.population / areaKm2, 1) : 0,
      changeAbs: previousTotal ? total.population - previousTotal.population : null,
      changePct: previousTotal?.population
        ? round(((total.population - previousTotal.population) / previousTotal.population) * 100, 2)
        : null,
      femaleSharePct: total.population > 0 ? round((total.female / total.population) * 100, 2) : 0,
      mostPopulous: rows[0]?.name ?? null,
      highestDensity: densityRows[0]?.name ?? null,
      fastestGrowing: growthRows[0]?.name ?? null,
      highestExposure: exposureRows[0]?.name ?? null,
      source: populationData.metadata.population_source_th,
      sourceUrl: populationData.metadata.population_source_url,
      boundarySource: populationData.metadata.boundary_source,
      processingNote: populationData.metadata.processing_note,
      dataQuality: "observed" as const,
    },
  }, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}

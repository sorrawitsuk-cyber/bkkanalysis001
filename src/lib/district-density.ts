/* eslint-disable @typescript-eslint/no-explicit-any */
import bkkDistricts from "@/data/bkk_districts.json";

export interface DistrictDensityRow {
  district: string;
  density: number;
}

const rows: DistrictDensityRow[] = (bkkDistricts.features as any[])
  .map((feature: any) => ({
    district: String(feature.properties?.name_th ?? ""),
    density: Number(feature.properties?.density),
  }))
  .filter((row) => row.district && Number.isFinite(row.density));

const densityByDistrict = new Map(rows.map((row) => [row.district, row.density]));

export function getDistrictDensity(name: string | null | undefined): number | null {
  if (!name) return null;
  const normalized = name.replace(/^เขต/, "").trim();
  return densityByDistrict.get(normalized) ?? null;
}

export function getDistrictDensityRows(): DistrictDensityRow[] {
  return [...rows].sort((a, b) => b.density - a.density);
}

export function formatPopulationDensity(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return Math.round(value).toLocaleString("th-TH");
}

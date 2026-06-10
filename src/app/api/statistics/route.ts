/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase/server";
import geojson from "@/data/bkk_districts.json";

export const dynamic = "force-dynamic";

const featureByGeoJsonId = new Map<number, any>(
  (geojson.features as any[]).map((feature) => [Number(feature.properties.id), feature])
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const geoJsonId = Number(searchParams.get("district_id"));

  if (!Number.isInteger(geoJsonId) || geoJsonId < 1) {
    return NextResponse.json({ error: "district_id ไม่ถูกต้อง" }, { status: 400 });
  }

  const feature = featureByGeoJsonId.get(geoJsonId);
  if (!feature) {
    return NextResponse.json({ error: `ไม่พบเขต id=${geoJsonId}` }, { status: 404 });
  }

  const districtName = feature.properties.name_th as string;
  const { data: districtRows, error: districtError } = await supabase
    .from("districts")
    .select("id")
    .eq("name_th", districtName)
    .limit(1);

  if (districtError) {
    return NextResponse.json({ error: districtError.message }, { status: 503 });
  }

  const databaseDistrictId = districtRows?.[0]?.id;
  if (!databaseDistrictId) {
    return NextResponse.json({ error: `ไม่พบ mapping ฐานข้อมูลของเขต ${districtName}` }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("district_statistics")
    .select("*")
    .eq("district_id", databaseDistrictId)
    .order("year", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  const rows = (data ?? []).map((row: any) => ({
    ...row,
    district_id: geoJsonId,
    database_district_id: databaseDistrictId,
    district_name: districtName,
    name_th: districtName,
    // VIIRS annual observations currently end at 2024.
    ntl_mean: row.year <= 2024 ? (row.ntl_mean ?? null) : null,
    ntl_max: row.year <= 2024 ? (row.ntl_max ?? null) : null,
  }));

  return NextResponse.json(rows, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800" },
  });
}

import { NextRequest, NextResponse } from "next/server";
import data from "@/data/bkk_accessibility.json";
import boundaries from "@/data/bkk_districts.json";
import {
  ACCESSIBILITY_CATEGORIES,
  type AccessibilityCategory,
} from "@/lib/accessibility";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category");
  const districtId = Number(request.nextUrl.searchParams.get("districtId") || 0);
  const validCategory = ACCESSIBILITY_CATEGORIES.includes(category as AccessibilityCategory)
    ? category
    : null;

  const districts = districtId
    ? data.districts.filter((district) => district.district_id === districtId)
    : data.districts;
  const services = data.services.filter((service) => {
    if (districtId && service.district_id !== districtId) return false;
    if (validCategory && service.category !== validCategory) return false;
    return true;
  });
  const rowById = new Map(data.districts.map((district) => [district.district_id, district]));
  const geojson = {
    type: "FeatureCollection",
    features: boundaries.features
      .filter((feature) => !districtId || feature.properties.id === districtId)
      .map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          accessibility: rowById.get(feature.properties.id) ?? null,
        },
      })),
  };

  return NextResponse.json(
    {
      metadata: data.metadata,
      summary: data.summary,
      districts,
      services,
      geojson,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}

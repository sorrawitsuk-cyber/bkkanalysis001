import { NextResponse } from "next/server";
import {
  getRegistrySummary,
  OBSERVATORY_REGISTRY,
  REGISTRY_DATASETS,
  REGISTRY_PRODUCTS,
} from "@/lib/observatory/registry";

export const revalidate = 86400;

export async function GET() {
  return NextResponse.json(
    {
      schemaVersion: OBSERVATORY_REGISTRY.schemaVersion,
      registryVersion: OBSERVATORY_REGISTRY.registryVersion,
      lastReviewedAt: OBSERVATORY_REGISTRY.lastReviewedAt,
      scope: OBSERVATORY_REGISTRY.scope,
      publicationPolicy: OBSERVATORY_REGISTRY.publicationPolicy,
      summary: getRegistrySummary(),
      datasets: REGISTRY_DATASETS,
      products: REGISTRY_PRODUCTS,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}

import { NextResponse } from "next/server";
import {
  getRegistrySummary,
  OBSERVATORY_REGISTRY,
  REGISTRY_PRODUCTS,
} from "@/lib/observatory/registry";

export const dynamic = "force-static";

export async function GET() {
  const summary = getRegistrySummary();

  return NextResponse.json(
    {
      statusType: "registry-readiness",
      registryVersion: OBSERVATORY_REGISTRY.registryVersion,
      reviewedAt: OBSERVATORY_REGISTRY.lastReviewedAt,
      summary,
      products: REGISTRY_PRODUCTS.map((product) => ({
        productId: product.id,
        status: product.publishGate.status,
        methodVersion: product.recipe.methodVersion,
        sourceDatasetIds: product.sourceDatasetIds,
        publishGate: {
          minValidCoverage: product.publishGate.minValidCoverage,
          minSceneCount: product.publishGate.minSceneCount,
          requiresValidatedDatasets:
            product.publishGate.requiresValidatedDatasets,
        },
      })),
      liveSourceHealth: null,
      note: "สถานะนี้มาจาก evidence registry ไม่ใช่การตรวจสุขภาพ source หรือ pipeline แบบเรียลไทม์",
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}

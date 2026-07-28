import { NextResponse } from "next/server";
import {
  getRegistrySummary,
  OBSERVATORY_REGISTRY,
  REGISTRY_PRODUCTS,
} from "@/lib/observatory/registry";
import { getObservatoryDatabaseStatus } from "@/lib/supabase/observatory-public";

export const dynamic = "force-dynamic";

export async function GET() {
  const summary = getRegistrySummary();
  const database = await getObservatoryDatabaseStatus();

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
      database,
      liveSourceHealth: null,
      note: "สถานะความพร้อมมาจาก evidence registry ส่วน database แสดงเฉพาะข้อมูลที่ผ่าน RLS สำหรับ public และไม่ใช่การตรวจสุขภาพ source หรือ pipeline แบบเรียลไทม์",
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}

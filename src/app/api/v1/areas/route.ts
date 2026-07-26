import { NextResponse } from "next/server";
import districtGeoJson from "@/data/observatory/bkk-districts.provisional.json";
import { OBSERVATORY_REGISTRY } from "@/lib/observatory/registry";

export const revalidate = 86400;

export async function GET() {
  const artifact = OBSERVATORY_REGISTRY.runtimeArtifacts.find(
    (item) => item.id === "district-boundary-runtime",
  );
  const cacheControl = artifact?.status === "validated"
    ? "public, s-maxage=86400, stale-while-revalidate=604800"
    : "no-store";

  return NextResponse.json(
    {
      type: "FeatureCollection",
      features: districtGeoJson.features,
      meta: {
        count: districtGeoJson.features.length,
        boundaryVersion: artifact?.checksumSha256 ?? "unknown",
        sourceDatasetId: artifact?.datasetId ?? "unknown",
        registryVersion: OBSERVATORY_REGISTRY.registryVersion,
        qualityStatus: artifact?.status ?? "provisional",
        note: "geometry ชั่วคราวสำหรับ R&D เท่านั้น รอแทนที่ด้วย snapshot ทางการที่ผ่าน license, checksum, CRS และ topology QA",
      },
    },
    {
      headers: {
        "Cache-Control": cacheControl,
      },
    },
  );
}

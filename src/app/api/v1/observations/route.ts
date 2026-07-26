import { NextResponse } from "next/server";
import { GET as getLegacyDistrictMetrics } from "@/app/api/district-metrics/route";
import {
  getObservatoryLens,
  OBSERVATORY_LENSES,
  type ObservatoryLensId,
} from "@/lib/observatory/catalog";
import {
  getRegistryProduct,
  OBSERVATORY_REGISTRY,
} from "@/lib/observatory/registry";

const SUSPICIOUS_SOURCE = /mock|demo|fallback|seeded|synthetic|local fallback/i;
const MIN_YEAR = 2015;
const MAX_YEAR = 2026;

function parseYear(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= MIN_YEAR && parsed <= MAX_YEAR
    ? parsed
    : fallback;
}

function unavailable(options: {
  lensId: ObservatoryLensId;
  year: number;
  baseline: number;
  reason: string;
  quality?: string;
}) {
  const lens = getObservatoryLens(options.lensId);
  const product = getRegistryProduct(options.lensId);
  return NextResponse.json(
    {
      productId: lens.id,
      status: "unavailable",
      period: { year: options.year, baseline: options.baseline },
      observations: [],
      summary: null,
      provenance: {
        sourceLabel: lens.source,
        sourceId: lens.sourceId,
        measurementType: lens.measurementType,
        quality: options.quality || "unavailable",
        acceptanceStatus: product?.publishGate.status ?? "unregistered",
        methodVersion: product?.recipe.methodVersion ?? "unregistered",
        resolution: lens.resolution,
      },
      reason: options.reason,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedProduct = searchParams.get("product");
  const lens = OBSERVATORY_LENSES.find((item) => item.id === requestedProduct);

  if (!lens) {
    return NextResponse.json(
      { error: "product ไม่อยู่ใน catalog" },
      { status: 400 },
    );
  }

  const year = parseYear(searchParams.get("year"), 2024);
  const baseline = Math.min(parseYear(searchParams.get("baseline"), 2018), year - 1);
  const registryProduct = getRegistryProduct(lens.id);

  if (
    !registryProduct
    || !OBSERVATORY_REGISTRY.publicationPolicy.publicProductStatuses.includes(
      registryProduct.publishGate.status,
    )
  ) {
    return unavailable({
      lensId: lens.id,
      year,
      baseline,
      reason: registryProduct
        ? `product อยู่ในสถานะ ${registryProduct.publishGate.status} และยังไม่ผ่าน publish gate`
        : "product ยังไม่ถูกบันทึกใน evidence registry",
      quality: "unavailable",
    });
  }

  if (!lens.apiMetric || !lens.valueKey) {
    return unavailable({
      lensId: lens.id,
      year,
      baseline,
      reason: "product นี้ยังไม่มี observation pipeline ที่ผ่าน data acceptance",
      quality: "unavailable",
    });
  }

  try {
    const bridgeUrl = new URL("/api/district-metrics", request.url);
    bridgeUrl.searchParams.set("metric", lens.apiMetric);
    bridgeUrl.searchParams.set("year", String(year));
    bridgeUrl.searchParams.set("compareYear", String(baseline));

    const bridgeResponse = await getLegacyDistrictMetrics(new Request(bridgeUrl));
    if (!bridgeResponse.ok) {
      return unavailable({
        lensId: lens.id,
        year,
        baseline,
        reason: "legacy bridge ตอบกลับไม่สำเร็จ จึงไม่เผยแพร่ observation",
      });
    }

    const payload = await bridgeResponse.json() as {
      geojson?: {
        features?: Array<{
          properties?: Record<string, unknown>;
        }>;
      };
      summary?: Record<string, unknown>;
    };

    const quality = String(payload.summary?.dataQuality ?? "unknown").toLowerCase();
    const source = [
      payload.summary?.dataSource,
      payload.summary?.sourceLabel,
      payload.summary?.sourceNote,
    ].filter(Boolean).join(" ");

    if (quality !== "observed" || SUSPICIOUS_SOURCE.test(source)) {
      return unavailable({
        lensId: lens.id,
        year,
        baseline,
        reason: quality === "unavailable"
          ? "ไม่พบข้อมูลที่ผ่านการตรวจสำหรับปีและตัวชี้วัดที่เลือก"
          : "ข้อมูล bridge มีสถานะ modeled, estimated, fallback หรือไม่ทราบที่มา",
        quality,
      });
    }

    const observations = (payload.geojson?.features ?? []).flatMap((feature) => {
      const properties = feature.properties ?? {};
      const id = Number(properties.id ?? properties.district_id);
      const value = properties[lens.valueKey!];
      if (!Number.isInteger(id) || typeof value !== "number" || !Number.isFinite(value)) {
        return [];
      }
      return [{
        areaCode: `BKK-D${String(id).padStart(2, "0")}`,
        statistic: "mean",
        value,
        unit: lens.unit,
        coverage: null,
      }];
    });

    if (observations.length === 0) {
      return unavailable({
        lensId: lens.id,
        year,
        baseline,
        reason: "ไม่พบ observation ที่มีค่าและ area code ครบ",
        quality,
      });
    }

    const averageValue = payload.summary?.averageValue;
    return NextResponse.json(
      {
        productId: lens.id,
        status: "available",
        period: { year, baseline },
        observations,
        summary: {
          averageValue: typeof averageValue === "number" && Number.isFinite(averageValue)
            ? averageValue
            : null,
          observationCount: observations.length,
        },
        provenance: {
          sourceLabel: String(payload.summary?.sourceLabel ?? payload.summary?.dataSource ?? lens.source),
          sourceId: lens.sourceId,
          sourceNote: String(payload.summary?.sourceNote ?? lens.limitation),
          measurementType: lens.measurementType,
          quality: "observed",
          acceptanceStatus: registryProduct.publishGate.status,
          methodVersion: registryProduct.recipe.methodVersion,
          resolution: lens.resolution,
          periodLabel: String(payload.summary?.periodLabel ?? `ปี ${year}`),
        },
        reason: null,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
        },
      },
    );
  } catch (error: unknown) {
    console.error("Observatory observations bridge failed", error);
    return unavailable({
      lensId: lens.id,
      year,
      baseline,
      reason: "ตรวจ observation ไม่สำเร็จ ระบบจึงไม่เผยแพร่ค่าชั่วคราว",
    });
  }
}

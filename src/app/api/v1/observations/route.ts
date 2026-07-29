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
import {
  getResearchDistrictObservations,
  type ResearchSeason,
} from "@/lib/supabase/observatory-research";

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
  season?: ResearchSeason;
  reason: string;
  quality?: string;
}) {
  const lens = getObservatoryLens(options.lensId);
  const product = getRegistryProduct(options.lensId);
  return NextResponse.json(
    {
      productId: lens.id,
      status: "unavailable",
      period: {
        year: options.year,
        baseline: options.baseline,
        season: options.season ?? null,
      },
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
  const requestedSeason = searchParams.get("season");
  const season: ResearchSeason =
    requestedSeason === "hot"
    || requestedSeason === "cool"
      ? requestedSeason
      : "wet";
  const registryProduct = getRegistryProduct(lens.id);

  const researchPreview = registryProduct?.evidence?.researchPreview;
  if (
    lens.id === "vegetation"
    && registryProduct
    && researchPreview?.status === "available"
  ) {
    try {
      const research = await getResearchDistrictObservations({
        preview: researchPreview,
        productId: lens.id,
        year,
        baseline,
        season,
      });
      const seasonLabel = {
        hot: "ฤดูร้อน มี.ค.–พ.ค.",
        wet: "ฤดูฝน มิ.ย.–ต.ค.",
        cool: "ฤดูเย็น พ.ย.–ก.พ.",
      }[season];
      return NextResponse.json(
        {
          productId: lens.id,
          status: "research",
          period: { year, baseline, season },
          observations: research.observations,
          summary: research.summary,
          provenance: {
            sourceLabel:
              "Copernicus Sentinel-2 Level-2A ผ่าน Google Earth Engine",
            sourceId: lens.sourceId,
            sourceNote:
              "สถิติ NDVI ระดับเขตสำหรับ R&D ใช้ขอบเขต CityMap "
              + `ปีสำรวจ ${research.boundarySurveyYearsBuddhist.join(", ")} `
              + "แบบชั่วคราว ไม่เก็บหรือเผยแพร่ geometry ต้นทาง",
            measurementType: lens.measurementType,
            quality: "research-qa-passed",
            acceptanceStatus:
              registryProduct.publishGate.status,
            methodVersion: registryProduct.recipe.methodVersion,
            resolution: lens.resolution,
            periodLabel:
              `${seasonLabel} ปี ${year} เทียบ ${baseline}`,
            processingRunId: researchPreview.processingRunId,
            resultChecksumSha256:
              researchPreview.resultChecksumSha256,
            boundaryResultChecksumSha256:
              researchPreview.boundaryResultChecksumSha256,
          },
          reason:
            "ข้อมูลผ่าน QA ภายในสำหรับ R&D แต่ยังไม่ใช่ผลิตภัณฑ์ "
            + "validated สำหรับการเผยแพร่ทั่วไป",
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    } catch (error: unknown) {
      console.error("Observatory research observations failed", error);
      return unavailable({
        lensId: lens.id,
        year,
        baseline,
        season,
        reason:
          "ชุดข้อมูลวิจัยไม่ครบหรือ provenance ไม่ตรง "
          + "ระบบจึงไม่แสดงค่า",
        quality: "research-unavailable",
      });
    }
  }

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
      season,
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
      season,
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
        season,
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
        season,
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
        season,
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
      season,
      reason: "ตรวจ observation ไม่สำเร็จ ระบบจึงไม่เผยแพร่ค่าชั่วคราว",
    });
  }
}

"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownUp,
  Check,
  CircleOff,
  Database,
  FileCheck2,
  FlaskConical,
  Layers3,
  Map as MapIcon,
  ScanSearch,
  Table2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getObservatoryLens,
  OBSERVATORY_LENSES,
  type ObservatoryLensId,
} from "@/lib/observatory/catalog";
import type { CityMapStatus } from "@/lib/observatory/citymap";

const ObservatoryMap = dynamic(() => import("./ObservatoryMap"), {
  ssr: false,
  loading: () => <div className="min-h-[520px] animate-pulse bg-[var(--oe-map-canvas)]" aria-label="กำลังเตรียมแผนที่" />,
});

type AreaProperties = {
  areaCode: string;
  legacyId: number;
  nameTh: string;
  nameEn: string;
  level: string;
  metricValue?: number | null;
  baselineValue?: number | null;
  metricDelta?: number | null;
  metricCoverage?: number | null;
  metricP10?: number | null;
  metricP90?: number | null;
  sceneCount?: number | null;
};

type AreaFeature = {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: AreaProperties;
};

type AreaCollection = {
  type: "FeatureCollection";
  features: AreaFeature[];
  meta?: {
    count: number;
    boundaryVersion: string;
    qualityStatus: string;
    note: string;
  };
};

type ObservationPayload = {
  productId?: string;
  status?: "available" | "research" | "unavailable";
  period?: {
    year: number;
    baseline: number;
    season?: ObservatorySeason | null;
  };
  observations?: Array<{
    areaCode: string;
    statistic: string;
    value: number;
    baselineValue?: number;
    delta?: number;
    p10?: number;
    p90?: number;
    interquartileRange?: number;
    unit: string;
    coverage: number | null;
    baselineCoverage?: number;
    sceneCount?: number;
    baselineSceneCount?: number;
    validObservationCount?: number;
  }>;
  summary?: {
    averageValue: number | null;
    averageBaselineValue?: number | null;
    averageDelta?: number | null;
    observationCount: number;
    minCoverage?: number;
    minBaselineCoverage?: number;
  } | null;
  provenance?: {
    sourceLabel?: string;
    sourceId?: string;
    sourceNote?: string;
    measurementType?: string;
    quality?: string;
    methodVersion?: string;
    resolution?: string;
    periodLabel?: string;
    processingRunId?: string;
    resultChecksumSha256?: string;
    boundaryResultChecksumSha256?: string;
  };
  reason?: string | null;
  error?: string;
};

type DataState =
  | "loading"
  | "available"
  | "research"
  | "withheld"
  | "planned"
  | "error";
type ViewMode = "map" | "table";
type ObservatorySeason = "hot" | "wet" | "cool";

type ObservatoryWorkspaceProps = {
  initialLens: ObservatoryLensId;
  initialYear: number;
  initialBaseline: number;
  initialSeason: ObservatorySeason;
  initialArea: string;
};

const YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];
const RESEARCH_YEARS = [2025, 2024];
const SEASONS: Array<{
  id: ObservatorySeason;
  label: string;
  shortLabel: string;
}> = [
  { id: "hot", label: "ฤดูร้อน มี.ค.–พ.ค.", shortLabel: "ฤดูร้อน" },
  { id: "wet", label: "ฤดูฝน มิ.ย.–ต.ค.", shortLabel: "ฤดูฝน" },
  { id: "cool", label: "ฤดูเย็น พ.ย.–ก.พ.", shortLabel: "ฤดูเย็น" },
];

function formatValue(value: number | null | undefined, decimals: number, unit: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "ไม่มีค่าที่ผ่านเงื่อนไข";
  const formatted = value.toLocaleString("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return unit ? `${formatted} ${unit}` : formatted;
}

function qualityText(state: DataState) {
  if (state === "available") return "ข้อมูลสังเกตพร้อมอ่าน";
  if (state === "research") return "ข้อมูล R&D ผ่าน QA ภายใน";
  if (state === "withheld") return "ระงับการแสดงค่าที่ไม่ผ่านนโยบาย";
  if (state === "planned") return "อยู่ระหว่าง data acceptance";
  if (state === "error") return "ตรวจสถานะข้อมูลไม่ได้";
  return "กำลังตรวจหลักฐานข้อมูล";
}

function formatSignedValue(
  value: number | null | undefined,
  decimals: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "ไม่มีค่าเปรียบเทียบ";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export default function ObservatoryWorkspace({
  initialLens,
  initialYear,
  initialBaseline,
  initialSeason,
  initialArea,
}: ObservatoryWorkspaceProps) {
  const router = useRouter();
  const [lensId, setLensId] = useState<ObservatoryLensId>(initialLens);
  const [year, setYear] = useState(initialYear);
  const [baseline, setBaseline] = useState(initialBaseline);
  const [season, setSeason] =
    useState<ObservatorySeason>(initialSeason);
  const [areas, setAreas] = useState<AreaCollection | null>(null);
  const [observationPayload, setObservationPayload] = useState<ObservationPayload | null>(null);
  const [state, setState] = useState<DataState>("loading");
  const [statusReason, setStatusReason] = useState("");
  const [view, setView] = useState<ViewMode>("map");
  const [basemapStatus, setBasemapStatus] =
    useState<CityMapStatus>("loading");
  const [selectedName, setSelectedName] = useState<string | null>(
    initialArea !== "bangkok" ? initialArea : null,
  );
  const [appliedArea, setAppliedArea] = useState(initialArea);
  const lens = getObservatoryLens(lensId);
  const isResearchVegetation = lens.id === "vegetation";
  const hasValues = state === "available" || state === "research";
  const seasonLabel = SEASONS.find(
    (item) => item.id === season,
  )?.shortLabel;
  const boundaryVersion = areas?.meta?.boundaryVersion;
  const boundaryLabel = boundaryVersion
    ? boundaryVersion.length > 16
      ? `${boundaryVersion.slice(0, 12)}…`
      : boundaryVersion
    : "กำลังตรวจ";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/areas", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("ไม่สามารถอ่านขอบเขตพื้นที่ได้");
        return response.json() as Promise<AreaCollection>;
      })
      .then((payload) => {
        if (!cancelled) setAreas(payload);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatusReason(error instanceof Error ? error.message : "ไม่สามารถอ่านขอบเขตพื้นที่ได้");
          setState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setObservationPayload(null);
    setStatusReason("");

    if (!lens.apiMetric) {
      setState("planned");
      setStatusReason("product นี้ยังไม่มี read-only API ที่ผ่าน data acceptance จึงไม่แสดงค่าชั่วคราว");
      return () => {
        cancelled = true;
      };
    }

    setState("loading");
    const params = new URLSearchParams({
      product: lens.id,
      year: String(year),
      baseline: String(baseline),
      season,
    });

    fetch(`/api/v1/observations?${params.toString()}`)
      .then(async (response) => {
        const payload = await response.json() as ObservationPayload;
        if (!response.ok) throw new Error(payload.error || "ไม่สามารถอ่านข้อมูลตัวชี้วัดได้");
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        setObservationPayload(payload);
        if (payload.status === "available") {
          setState("available");
          return;
        }
        if (payload.status === "research") {
          setState("research");
          setStatusReason(
            payload.reason
            || "ข้อมูลนี้พร้อมสำหรับการวิเคราะห์ R&D เท่านั้น",
          );
          return;
        }
        setState("withheld");
        setStatusReason(payload.reason || "ข้อมูลไม่ผ่านนโยบายการเผยแพร่ของ Observatory");
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState("error");
          setStatusReason(error instanceof Error ? error.message : "ไม่สามารถอ่านข้อมูลตัวชี้วัดได้");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [baseline, lens.apiMetric, lens.id, season, year]);

  const mergedAreas = useMemo<AreaCollection | null>(() => {
    if (!areas) return null;
    if (!hasValues || !observationPayload?.observations) return areas;

    const byAreaCode = new Map(
      observationPayload.observations.map(
        (observation) => [observation.areaCode, observation],
      ),
    );

    return {
      ...areas,
      features: areas.features.map((feature) => {
        const observation = byAreaCode.get(
          feature.properties.areaCode,
        );
        const rawValue = observation?.value;
        return {
          ...feature,
          properties: {
            ...feature.properties,
            metricValue: typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : null,
            baselineValue:
              typeof observation?.baselineValue === "number"
                ? observation.baselineValue
                : null,
            metricDelta:
              typeof observation?.delta === "number"
                ? observation.delta
                : null,
            metricCoverage:
              typeof observation?.coverage === "number"
                ? observation.coverage
                : null,
            metricP10:
              typeof observation?.p10 === "number"
                ? observation.p10
                : null,
            metricP90:
              typeof observation?.p90 === "number"
                ? observation.p90
                : null,
            sceneCount:
              typeof observation?.sceneCount === "number"
                ? observation.sceneCount
                : null,
          },
        };
      }),
    };
  }, [areas, hasValues, observationPayload]);

  const selectedFeature = useMemo(
    () => mergedAreas?.features.find((feature) => feature.properties.nameTh === selectedName) ?? null,
    [mergedAreas, selectedName],
  );

  const sortedAreas = useMemo(() => {
    if (!mergedAreas) return [];
    return [...mergedAreas.features].sort((a, b) => {
      if (hasValues) {
        return (b.properties.metricValue ?? -Infinity) - (a.properties.metricValue ?? -Infinity);
      }
      return a.properties.nameTh.localeCompare(b.properties.nameTh, "th");
    });
  }, [hasValues, mergedAreas]);

  const updateUrl = useCallback((next?: {
    lens?: ObservatoryLensId;
    nextYear?: number;
    nextBaseline?: number;
    nextSeason?: ObservatorySeason;
    area?: string;
  }) => {
    const params = new URLSearchParams({
      lens: next?.lens ?? lensId,
      year: String(next?.nextYear ?? year),
      baseline: String(next?.nextBaseline ?? baseline),
      season: next?.nextSeason ?? season,
      area: next?.area ?? appliedArea,
    });
    router.replace(`/observatory?${params.toString()}`, { scroll: false });
  }, [appliedArea, baseline, lensId, router, season, year]);

  function chooseLens(nextLens: ObservatoryLensId) {
    const nextYear = nextLens === "vegetation" ? 2025 : year;
    const nextBaseline = nextLens === "vegetation" ? 2024 : baseline;
    setLensId(nextLens);
    setYear(nextYear);
    setBaseline(nextBaseline);
    setSelectedName(null);
    setAppliedArea("bangkok");
    updateUrl({
      lens: nextLens,
      nextYear,
      nextBaseline,
      area: "bangkok",
    });
  }

  function applySelectedArea() {
    const nextArea = selectedName ?? "bangkok";
    setAppliedArea(nextArea);
    updateUrl({ area: nextArea });
  }

  const sourceLabel = observationPayload?.provenance?.sourceLabel ?? lens.source;
  const sourceNote = observationPayload?.provenance?.sourceNote ?? lens.limitation;

  return (
    <main className="mx-auto max-w-[1600px] px-3 py-4 sm:px-5">
      <section aria-label="ตัวกรองการวิเคราะห์" className="mb-3 rounded-[var(--radius-panel)] border border-[var(--oe-line)] bg-white p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <p className="text-xs font-semibold text-[var(--oe-muted)]">คำถามที่กำลังตรวจ</p>
            <h1 className="mt-1 text-lg font-bold">{lens.question}</h1>
          </div>
          <label className="xl:hidden">
            <span className="mb-1 block text-xs font-semibold text-[var(--oe-muted)]">หัวข้อ</span>
            <select
              value={lensId}
              onChange={(event) => chooseLens(event.target.value as ObservatoryLensId)}
              className="min-h-11 max-w-[220px] rounded-[var(--radius-control)] border border-[var(--oe-line-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--oe-primary)] focus:ring-2 focus:ring-[var(--oe-primary-soft)]"
            >
              {OBSERVATORY_LENSES.map((item) => (
                <option key={item.id} value={item.id}>{item.shortTitle}</option>
              ))}
            </select>
          </label>
          {isResearchVegetation && (
            <label>
              <span className="mb-1 block text-xs font-semibold text-[var(--oe-muted)]">
                ฤดูกาล
              </span>
              <select
                value={season}
                onChange={(event) => {
                  const value =
                    event.target.value as ObservatorySeason;
                  setSeason(value);
                  updateUrl({ nextSeason: value });
                }}
                className="min-h-11 rounded-[var(--radius-control)] border border-[var(--oe-line-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--oe-primary)] focus:ring-2 focus:ring-[var(--oe-primary-soft)]"
              >
                {SEASONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span className="mb-1 block text-xs font-semibold text-[var(--oe-muted)]">ปีที่ตรวจ</span>
            <select
              value={year}
              onChange={(event) => {
                const value = Number(event.target.value);
                setYear(value);
                updateUrl({ nextYear: value });
              }}
              className="min-h-11 rounded-[var(--radius-control)] border border-[var(--oe-line-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--oe-primary)] focus:ring-2 focus:ring-[var(--oe-primary-soft)]"
            >
              {(isResearchVegetation ? [RESEARCH_YEARS[0]] : YEARS)
                .map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-[var(--oe-muted)]">ปีฐาน</span>
            <select
              value={baseline}
              onChange={(event) => {
                const value = Number(event.target.value);
                setBaseline(value);
                updateUrl({ nextBaseline: value });
              }}
              className="min-h-11 rounded-[var(--radius-control)] border border-[var(--oe-line-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--oe-primary)] focus:ring-2 focus:ring-[var(--oe-primary-soft)]"
            >
              {(isResearchVegetation ? RESEARCH_YEARS : YEARS)
                .filter((item) => item < year)
                .map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <div className={`flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-3 text-sm font-semibold ${
            state === "available"
              ? "bg-[var(--oe-success-soft)] text-[var(--oe-success-ink)]"
              : state === "research"
                ? "bg-[var(--oe-warning-soft)] text-[var(--oe-warning-ink)]"
              : state === "loading"
                ? "bg-[var(--oe-info-soft)] text-[var(--oe-info-ink)]"
                : "bg-[var(--oe-warning-soft)] text-[var(--oe-warning-ink)]"
          }`}>
            {state === "available"
              ? <Check className="h-4 w-4" />
              : state === "research"
                ? <FlaskConical className="h-4 w-4" />
                : state === "loading"
                  ? <ScanSearch className="h-4 w-4" />
                  : <CircleOff className="h-4 w-4" />}
            {qualityText(state)}
          </div>
        </div>
      </section>

      <div className="grid min-h-[680px] gap-3 xl:grid-cols-[250px_minmax(0,1fr)_330px]">
        <aside className="hidden rounded-[var(--radius-panel)] border border-[var(--oe-line)] bg-white p-3 xl:block">
          <div className="flex items-center gap-2 border-b border-[var(--oe-line-soft)] pb-3">
            <Layers3 className="h-4 w-4 text-[var(--oe-primary)]" />
            <h2 className="text-sm font-bold">คลังชั้นข้อมูล</h2>
          </div>
          <div className="mt-2 space-y-1">
            {OBSERVATORY_LENSES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => chooseLens(item.id)}
                aria-pressed={item.id === lensId}
                className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-[var(--radius-control)] px-3 text-left text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)] ${
                  item.id === lensId
                    ? "bg-[var(--oe-primary-soft)] font-bold text-[var(--oe-primary-ink)]"
                    : "text-[var(--oe-muted)] hover:bg-[var(--oe-surface-muted)] hover:text-[var(--oe-ink)]"
                }`}
              >
                <span>{item.shortTitle}</span>
                <span className={`text-[11px] font-semibold ${item.phase === "mvp" ? "text-[var(--oe-success-ink)]" : "text-[var(--oe-muted)]"}`}>
                  {item.phase === "mvp" ? "MVP" : "P2"}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-5 border-t border-[var(--oe-line-soft)] pt-4">
            <h3 className="text-xs font-bold text-[var(--oe-muted)]">บริบทที่จะเชื่อม</h3>
            <ul className="mt-2 space-y-2 text-xs leading-5 text-[var(--oe-muted)]">
              <li className="flex items-start justify-between gap-2"><span>ประชากรตามทะเบียน</span><span>ตรวจสิทธิ</span></li>
              <li className="flex items-start justify-between gap-2"><span>ประชากรแบบจำลอง</span><span>ตรวจรุ่น</span></li>
              <li className="flex items-start justify-between gap-2"><span>บริการเมือง BMA</span><span>ตรวจ resource</span></li>
            </ul>
          </div>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--oe-line)] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--oe-line)] px-3 py-2">
            <div>
              <h2 className="text-sm font-bold">{lens.title}</h2>
              <p className="mt-0.5 text-xs text-[var(--oe-muted)]">
                {isResearchVegetation && `${seasonLabel} · `}
                ปี {year} เทียบปีฐาน {baseline} · หน่วยพื้นที่ เขต
              </p>
            </div>
            <div className="flex rounded-[var(--radius-control)] border border-[var(--oe-line)] bg-[var(--oe-surface-muted)] p-1">
              <button
                type="button"
                onClick={() => setView("map")}
                aria-pressed={view === "map"}
                className={`inline-flex min-h-9 items-center gap-2 rounded-[6px] px-3 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)] ${
                  view === "map" ? "bg-white text-[var(--oe-primary-ink)]" : "text-[var(--oe-muted)]"
                }`}
              >
                <MapIcon className="h-3.5 w-3.5" /> แผนที่
              </button>
              <button
                type="button"
                onClick={() => setView("table")}
                aria-pressed={view === "table"}
                className={`inline-flex min-h-9 items-center gap-2 rounded-[6px] px-3 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)] ${
                  view === "table" ? "bg-white text-[var(--oe-primary-ink)]" : "text-[var(--oe-muted)]"
                }`}
              >
                <Table2 className="h-3.5 w-3.5" /> ตาราง
              </button>
            </div>
          </div>

          {state === "research" && (
            <div className="flex items-start gap-3 border-b border-[var(--oe-warning-line)] bg-[var(--oe-warning-soft)] px-4 py-3 text-sm text-[var(--oe-warning-ink)]">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <strong className="font-bold">
                  ข้อมูลวิจัย แสดงเพื่อการตรวจสอบ R&D
                </strong>
                <p className="mt-0.5 max-w-[75ch] leading-6">
                  {statusReason} ค่าบนแผนที่เป็นสัญญาณระดับเขต
                  ควรอ่าน coverage และช่วง p10–p90 ร่วมกัน
                </p>
              </div>
            </div>
          )}

          {!hasValues && state !== "loading" && (
            <div className="flex items-start gap-3 border-b border-[var(--oe-warning-line)] bg-[var(--oe-warning-soft)] px-4 py-3 text-sm text-[var(--oe-warning-ink)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <strong className="font-bold">ยังไม่แสดงค่าบนแผนที่</strong>
                <p className="mt-0.5 leading-6">{statusReason}</p>
              </div>
            </div>
          )}

          {view === "map" ? (
            <div className="relative min-h-[520px]">
              <ObservatoryMap
                geojson={mergedAreas}
                trustedValues={hasValues}
                selectedName={selectedName}
                ramp={lens.ramp}
                onSelect={(feature) => setSelectedName(feature.properties.nameTh)}
                onBasemapStatus={setBasemapStatus}
              />
              <div
                className={`absolute right-3 top-3 z-[400] inline-flex min-h-8 items-center gap-2 rounded-[var(--radius-control)] border px-2.5 text-xs font-semibold ${
                  basemapStatus === "ready"
                    ? "border-[var(--oe-line)] bg-white text-[var(--oe-ink)]"
                    : basemapStatus === "loading"
                      ? "border-[var(--oe-line)] bg-white text-[var(--oe-muted)]"
                      : "border-[var(--oe-warning-line)] bg-[var(--oe-warning-soft)] text-[var(--oe-warning-ink)]"
                }`}
                role="status"
                aria-live="polite"
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    basemapStatus === "ready"
                      ? "bg-[var(--oe-success)]"
                      : basemapStatus === "loading"
                        ? "bg-[var(--oe-info)]"
                        : "bg-[var(--oe-warning)]"
                  }`}
                  aria-hidden="true"
                />
                {basemapStatus === "ready"
                  ? "แผนที่ฐาน Bangkok CityMap"
                  : basemapStatus === "loading"
                    ? "กำลังโหลด Bangkok CityMap"
                    : "Bangkok CityMap ไม่พร้อมใช้งาน"}
              </div>
              <div className="absolute bottom-4 right-4 z-[400] max-w-[250px] rounded-[var(--radius-control)] border border-[var(--oe-line)] bg-white/95 p-3 text-xs">
                <p className="font-bold">{hasValues ? `ช่วงสี ${lens.unit}` : "ขอบเขตพื้นที่เท่านั้น"}</p>
                {hasValues ? (
                  <div className="mt-2 flex">
                    {lens.ramp.map((color) => <span key={color} className="h-2.5 flex-1" style={{ backgroundColor: color }} />)}
                  </div>
                ) : (
                  <p className="mt-1 leading-5 text-[var(--oe-muted)]">สีเทาไม่แทนระดับสูงหรือต่ำ</p>
                )}
              </div>
            </div>
          ) : (
            <div className="max-h-[620px] overflow-auto">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">รายชื่อเขตและค่าตัวชี้วัดที่ผ่านสถานะการใช้งาน</caption>
                <thead className="sticky top-0 bg-[var(--oe-surface-muted)] text-xs text-[var(--oe-muted)]">
                  <tr>
                    <th className="px-4 py-3 font-bold">พื้นที่</th>
                    <th className="px-4 py-3 font-bold">รหัสชั่วคราว</th>
                    <th className="px-4 py-3 text-right font-bold">
                      {year}
                    </th>
                    {isResearchVegetation && (
                      <>
                        <th className="px-4 py-3 text-right font-bold">
                          {baseline}
                        </th>
                        <th className="px-4 py-3 text-right font-bold">
                          เปลี่ยนแปลง
                        </th>
                        <th className="px-4 py-3 text-right font-bold">
                          Coverage
                        </th>
                      </>
                    )}
                    <th className="w-12 px-3 py-3"><span className="sr-only">เลือก</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAreas.map((feature) => (
                    <tr key={feature.properties.areaCode} className="border-t border-[var(--oe-line-soft)] hover:bg-[var(--oe-surface-muted)]">
                      <td className="px-4 py-3 font-semibold">{feature.properties.nameTh}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--oe-muted)]">{feature.properties.areaCode}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {hasValues
                          ? formatValue(feature.properties.metricValue, lens.decimals, lens.unit)
                          : "ระงับการแสดง"}
                      </td>
                      {isResearchVegetation && (
                        <>
                          <td className="px-4 py-3 text-right font-mono text-xs">
                            {hasValues
                              ? formatValue(
                                  feature.properties.baselineValue,
                                  lens.decimals,
                                  lens.unit,
                                )
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs">
                            {hasValues
                              ? formatSignedValue(
                                  feature.properties.metricDelta,
                                  lens.decimals,
                                )
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs">
                            {typeof feature.properties.metricCoverage
                              === "number"
                              ? `${(
                                  feature.properties.metricCoverage * 100
                                ).toLocaleString("th-TH", {
                                  maximumFractionDigits: 1,
                                })}%`
                              : "—"}
                          </td>
                        </>
                      )}
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setSelectedName(feature.properties.nameTh)}
                          className="min-h-9 rounded-[var(--radius-control)] px-2 text-xs font-bold text-[var(--oe-primary-ink)] outline-none hover:bg-[var(--oe-primary-soft)] focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)]"
                        >
                          เลือก
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-[var(--oe-line)] bg-[var(--oe-surface-muted)] px-4 py-3 text-xs text-[var(--oe-muted)]">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="font-bold text-[var(--oe-ink)]">{lens.measurementType}</span>
              <span>{sourceLabel}</span>
              <span>{lens.resolution}</span>
              <span>
                {isResearchVegetation && `${seasonLabel} · `}
                ปี {year}
              </span>
              {state === "research" && (
                <span className="font-semibold text-[var(--oe-warning-ink)]">
                  Research preview
                </span>
              )}
              <span title={boundaryVersion}>
                Display geometry: {areas?.meta?.qualityStatus ?? "กำลังตรวจ"} · {boundaryLabel}
              </span>
            </div>
          </div>
        </section>

        <aside className="rounded-[var(--radius-panel)] border border-[var(--oe-line)] bg-white">
          <div className="border-b border-[var(--oe-line)] p-4">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-[var(--oe-primary)]" />
              <h2 className="text-sm font-bold">ตรวจหลักฐานพื้นที่</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--oe-muted)]">เลือกเขตบนแผนที่หรือตารางเพื่ออ่านค่าและหลักฐาน</p>
          </div>

          <div className="p-4">
            {selectedFeature ? (
              <>
                <p className="text-xs font-semibold text-[var(--oe-muted)]">พื้นที่ที่เลือกชั่วคราว</p>
                <h3 className="mt-1 text-lg font-bold">{selectedFeature.properties.nameTh}</h3>
                <p className="text-xs text-[var(--oe-muted)]">{selectedFeature.properties.nameEn}</p>
                <div className="mt-4 border-y border-[var(--oe-line-soft)] py-4">
                  <p className="text-xs font-semibold text-[var(--oe-muted)]">{lens.shortTitle}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">
                    {hasValues
                      ? formatValue(selectedFeature.properties.metricValue, lens.decimals, lens.unit)
                      : "ยังไม่มีค่าที่ผ่าน QA"}
                  </p>
                  {hasValues && isResearchVegetation && (
                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                      <div>
                        <dt className="text-[var(--oe-muted)]">
                          ปีฐาน {baseline}
                        </dt>
                        <dd className="mt-1 font-mono font-semibold">
                          {formatValue(
                            selectedFeature.properties.baselineValue,
                            lens.decimals,
                            lens.unit,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--oe-muted)]">
                          เปลี่ยนแปลง
                        </dt>
                        <dd className="mt-1 font-mono font-semibold">
                          {formatSignedValue(
                            selectedFeature.properties.metricDelta,
                            lens.decimals,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--oe-muted)]">
                          ช่วง p10–p90
                        </dt>
                        <dd className="mt-1 font-mono font-semibold">
                          {formatValue(
                            selectedFeature.properties.metricP10,
                            lens.decimals,
                            "",
                          )}{" – "}
                          {formatValue(
                            selectedFeature.properties.metricP90,
                            lens.decimals,
                            lens.unit,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--oe-muted)]">
                          Coverage
                        </dt>
                        <dd className="mt-1 font-mono font-semibold">
                          {typeof selectedFeature.properties.metricCoverage
                          === "number"
                            ? `${(
                                selectedFeature.properties.metricCoverage
                                * 100
                              ).toLocaleString("th-TH", {
                                maximumFractionDigits: 1,
                              })}%`
                            : "ไม่มีค่า"}
                        </dd>
                      </div>
                    </dl>
                  )}
                  <p className="mt-2 text-xs leading-5 text-[var(--oe-muted)]">
                    {hasValues
                      ? "ค่านี้เป็นสัญญาณระดับเขต ควรเปิด distribution และ pixel coverage ก่อนสรุป"
                      : statusReason || "กำลังตรวจสถานะข้อมูล"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={applySelectedArea}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--oe-primary)] px-4 text-sm font-bold text-white outline-none hover:bg-[var(--oe-primary-hover)] focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)] focus-visible:ring-offset-2"
                >
                  <Check className="h-4 w-4" />
                  ใช้เป็นพื้นที่ศึกษา
                </button>
                {appliedArea === selectedFeature.properties.nameTh && (
                  <p className="mt-2 text-center text-xs font-semibold text-[var(--oe-success-ink)]">ใช้เป็นตัวกรองใน URL แล้ว</p>
                )}
              </>
            ) : (
              <div className="rounded-[var(--radius-control)] bg-[var(--oe-surface-muted)] p-4 text-sm leading-6 text-[var(--oe-muted)]">
                ยังไม่ได้เลือกพื้นที่ การคลิกจะแสดง inspector ก่อน และจะเปลี่ยนตัวกรองเมื่อกด “ใช้เป็นพื้นที่ศึกษา”
              </div>
            )}

            <div className="mt-5 space-y-4 border-t border-[var(--oe-line)] pt-5">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold">
                  <Database className="h-3.5 w-3.5" />
                  แหล่งข้อมูล
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--oe-muted)]">{sourceLabel}</p>
                <p className="mt-1 font-mono text-[11px] text-[var(--oe-muted)]">{lens.sourceId}</p>
                {observationPayload?.provenance?.processingRunId && (
                  <p
                    className="mt-2 break-all font-mono text-[10px] leading-4 text-[var(--oe-muted)]"
                    title={
                      observationPayload.provenance
                        .resultChecksumSha256
                    }
                  >
                    Run:{" "}
                    {observationPayload.provenance.processingRunId}
                  </p>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs font-bold">
                  <ArrowDownUp className="h-3.5 w-3.5" />
                  วิธีเปรียบเทียบ
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--oe-muted)]">{lens.method}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs font-bold">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  ข้อจำกัด
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--oe-muted)]">{sourceNote}</p>
              </div>
              <div>
                <p className="text-xs font-bold">ควรตรวจร่วมกับ</p>
                <p className="mt-1 text-xs leading-5 text-[var(--oe-muted)]">{lens.verifyWith}</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

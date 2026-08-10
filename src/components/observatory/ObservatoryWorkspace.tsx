"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownUp,
  BarChart3,
  Check,
  Database,
  Layers3,
  Map as MapIcon,
  MapPinned,
  ScanSearch,
  Satellite,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getObservatoryLens,
  OBSERVATORY_LENSES,
  type ObservatoryLensId,
} from "@/lib/observatory/catalog";
import type {
  AreaCollection,
  AreaFeature,
  GeeLayerStatus,
  GeePointResult,
  MapDisplayMode,
} from "./ObservatoryMap";

const ObservatoryMap = dynamic(() => import("./ObservatoryMap"), {
  ssr: false,
  loading: () => (
    <div
      className="min-h-[580px] animate-pulse bg-[var(--oe-map-canvas)]"
      aria-label="กำลังเตรียมแผนที่"
    />
  ),
});

type BasemapStatus = "loading" | "ready" | "unavailable";
type DataState = "loading" | "available" | "research" | "withheld" | "planned" | "error";
type ObservatorySeason = "hot" | "wet" | "cool";
type ResultMode = "current" | "change";

type DistrictApiFeature = {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown> & {
    id?: number;
    name_th?: string;
    name_en?: string;
    delta?: number | null;
  };
};

type DistrictPayload = {
  geojson?: {
    type: "FeatureCollection";
    features: DistrictApiFeature[];
  };
  summary?: {
    averageValue?: number | null;
    baselineAverageValue?: number | null;
    valueDelta?: number | null;
    avgDelta?: number | null;
    maxValue?: number | null;
    minValue?: number | null;
    validDistrictCount?: number;
    totalDistrictCount?: number;
    coverageRatio?: number | null;
    dataOrigin?: string;
    dataSource?: string;
    dataQuality?: string;
    unavailableReason?: string | null;
    observationStart?: string;
    observationEnd?: string;
    resolutionMeters?: number | null;
    aggregationScaleMeters?: number | null;
    sceneCount?: number | null;
  };
  error?: string;
};

type ObservatoryWorkspaceProps = {
  initialLens: ObservatoryLensId;
  initialYear: number;
  initialBaseline: number;
  initialSeason: ObservatorySeason;
  initialArea: string;
  initialMode?: MapDisplayMode;
  initialCompare?: boolean;
};

const YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015];
const SEASONS: Array<{ id: ObservatorySeason; label: string }> = [
  { id: "hot", label: "ฤดูร้อน มี.ค.–พ.ค." },
  { id: "wet", label: "ฤดูฝน มิ.ย.–ต.ค." },
  { id: "cool", label: "ฤดูเย็น พ.ย.–ก.พ." },
];

function formatValue(value: number | null | undefined, decimals: number, unit: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "ยังไม่มีข้อมูล";
  const formatted = value.toLocaleString("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatSignedValue(value: number | null | undefined, decimals: number, unit = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "ยังไม่มีข้อมูล";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatValue(value, decimals, unit)}`;
}

function sourceStatusText(origin: string | undefined) {
  if (origin === "live-gee" || origin === "gee") return "คำนวณใหม่จากภาพดาวเทียม";
  if (origin === "verified-snapshot") return "ข้อมูลดาวเทียมที่ประมวลผลและตรวจไว้แล้ว";
  if (origin === "database" || origin === "supabase") return "ใช้ข้อมูลสรุปที่บันทึกไว้";
  if (origin === "unavailable") return "ข้อมูลยังไม่ครบ";
  return "กำลังตรวจแหล่งข้อมูล";
}

function friendlyMessage(message: string | undefined) {
  if (!message) return "ระบบยังอ่านข้อมูลชุดนี้ไม่ได้ในขณะนี้";
  if (/credential|auth|token|environment variable|service account/i.test(message)) {
    return "ระบบยังเชื่อมข้อมูลดาวเทียมไม่ได้ในขณะนี้";
  }
  if (/timeout|timed out/i.test(message)) {
    return "การประมวลผลใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง";
  }
  return message;
}

export default function ObservatoryWorkspace({
  initialLens,
  initialYear,
  initialBaseline,
  initialSeason,
  initialArea,
  initialMode = "district",
  initialCompare = false,
}: ObservatoryWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [lensId, setLensId] = useState<ObservatoryLensId>(initialLens);
  const [year, setYear] = useState(initialYear);
  const [baseline, setBaseline] = useState(initialBaseline);
  const [season, setSeason] = useState<ObservatorySeason>(initialSeason);
  const [dataMode, setDataMode] = useState<MapDisplayMode>(initialMode);
  const [resultMode, setResultMode] = useState<ResultMode>(initialCompare ? "change" : "current");
  const [payload, setPayload] = useState<DistrictPayload | null>(null);
  const [state, setState] = useState<DataState>("loading");
  const [statusReason, setStatusReason] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(
    initialArea !== "bangkok" ? initialArea : null,
  );
  const [basemapStatus, setBasemapStatus] = useState<BasemapStatus>("loading");
  const [geeStatus, setGeeStatus] = useState<GeeLayerStatus>({ state: "idle" });
  const [pointResult, setPointResult] = useState<GeePointResult | null>(null);

  const lens = getObservatoryLens(lensId);
  const displayUnit = lens.id === "air" ? "" : lens.unit;
  const compare = resultMode === "change";

  useEffect(() => {
    let cancelled = false;
    setPayload(null);
    setStatusReason("");
    if (!lens.apiMetric || !lens.valueKey) {
      setState("planned");
      setStatusReason("หัวข้อนี้ยังไม่มีตัวเลขสรุปรายเขต แต่ดูภาพดาวเทียมได้หากมีตัวเลือก");
      return () => {
        cancelled = true;
      };
    }

    setState("loading");
    const params = new URLSearchParams({
      metric: lens.apiMetric,
      year: String(year),
      compareYear: String(baseline),
    });
    fetch(`/api/district-metrics?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const nextPayload = await response.json() as DistrictPayload;
        if (!response.ok) throw new Error(nextPayload.error || "อ่านข้อมูลรายเขตไม่สำเร็จ");
        return nextPayload;
      })
      .then((nextPayload) => {
        if (cancelled) return;
        setPayload(nextPayload);
        const count = nextPayload.summary?.validDistrictCount ?? 0;
        if (count > 0) {
          const quality = String(nextPayload.summary?.dataQuality ?? "").toLowerCase();
          setState(quality.includes("research") ? "research" : "available");
        } else {
          setState("withheld");
          setStatusReason(friendlyMessage(nextPayload.summary?.unavailableReason || "ช่วงเวลานี้ยังไม่มีข้อมูลครบพอสำหรับสรุปรายเขต"));
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState("error");
        setStatusReason(friendlyMessage(error instanceof Error ? error.message : "อ่านข้อมูลรายเขตไม่สำเร็จ"));
      });
    return () => {
      cancelled = true;
    };
  }, [baseline, lens.apiMetric, lens.valueKey, year]);

  const areas = useMemo<AreaCollection | null>(() => {
    const source = payload?.geojson;
    if (!source) return null;
    return {
      type: "FeatureCollection",
      features: source.features.map((feature, index) => {
        const rawValue = lens.valueKey ? feature.properties[lens.valueKey] : null;
        const delta = feature.properties.delta;
        const currentValue = typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : null;
        const deltaValue = typeof delta === "number" && Number.isFinite(delta) ? delta : null;
        return {
          type: "Feature",
          geometry: feature.geometry,
          properties: {
            areaCode: String(feature.properties.id ?? index + 1).padStart(2, "0"),
            legacyId: Number(feature.properties.id ?? index + 1),
            nameTh: String(feature.properties.name_th ?? `เขต ${index + 1}`),
            nameEn: String(feature.properties.name_en ?? ""),
            level: "district",
            metricValue: currentValue,
            baselineValue: currentValue !== null && deltaValue !== null ? currentValue - deltaValue : null,
            metricDelta: deltaValue,
          },
        } satisfies AreaFeature;
      }),
    };
  }, [lens.valueKey, payload]);

  const sortedAreas = useMemo(() => {
    if (!areas) return [];
    return [...areas.features]
      .filter((feature) => typeof feature.properties.metricValue === "number")
      .sort((a, b) => (b.properties.metricValue ?? -Infinity) - (a.properties.metricValue ?? -Infinity));
  }, [areas]);

  const allDistricts = useMemo(() => {
    if (!areas) return [];
    return [...areas.features].sort((a, b) => a.properties.nameTh.localeCompare(b.properties.nameTh, "th"));
  }, [areas]);

  const selectedFeature = useMemo(
    () => areas?.features.find((feature) => feature.properties.nameTh === selectedName) ?? null,
    [areas, selectedName],
  );

  const updateUrl = useCallback((next?: {
    lens?: ObservatoryLensId;
    nextYear?: number;
    nextBaseline?: number;
    nextSeason?: ObservatorySeason;
    area?: string;
    mode?: MapDisplayMode;
    nextResultMode?: ResultMode;
  }) => {
    const params = new URLSearchParams({
      lens: next?.lens ?? lensId,
      year: String(next?.nextYear ?? year),
      baseline: String(next?.nextBaseline ?? baseline),
      season: next?.nextSeason ?? season,
      area: next?.area ?? selectedName ?? "bangkok",
      mode: next?.mode ?? dataMode,
      compare: (next?.nextResultMode ?? resultMode) === "change" ? "1" : "0",
    });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [baseline, dataMode, lensId, pathname, resultMode, router, season, selectedName, year]);

  function chooseLens(nextLensId: ObservatoryLensId) {
    const nextLens = getObservatoryLens(nextLensId);
    const nextMode = dataMode === "gee" && !nextLens.geeMetric ? "district" : dataMode;
    setLensId(nextLensId);
    setDataMode(nextMode);
    setSelectedName(null);
    setPointResult(null);
    updateUrl({ lens: nextLensId, area: "bangkok", mode: nextMode });
  }

  function chooseMode(nextMode: MapDisplayMode) {
    if (nextMode === "gee" && !lens.geeMetric) return;
    setDataMode(nextMode);
    setPointResult(null);
    updateUrl({ mode: nextMode });
  }

  function chooseArea(name: string) {
    const nextName = name === "bangkok" ? null : name;
    setSelectedName(nextName);
    updateUrl({ area: nextName ?? "bangkok" });
  }

  const summary = payload?.summary;
  const highest = sortedAreas[0] ?? null;
  const averageValue = summary?.averageValue ?? null;
  const averageDelta = summary?.valueDelta ?? summary?.avgDelta ?? null;
  const validDistricts = summary?.validDistrictCount ?? sortedAreas.length;
  const totalDistricts = summary?.totalDistrictCount ?? areas?.features.length ?? 50;
  const sourceLabel = summary?.dataSource && summary.dataSource !== "unavailable"
    ? summary.dataSource
    : lens.source;
  const districtValuesReady = state === "available" || state === "research";
  const mapValuesReady = dataMode === "district" && districtValuesReady;

  const statusLabel = dataMode === "gee"
    ? geeStatus.state === "ready"
      ? "ภาพพร้อมใช้งาน"
      : geeStatus.state === "loading"
        ? "กำลังประมวลผลภาพ"
        : geeStatus.state === "error"
          ? "ยังเปิดภาพไม่ได้"
          : "กำลังเตรียมภาพ"
    : state === "available" || state === "research"
      ? state === "research" ? "ข้อมูลทดลองพร้อมตรวจ" : "สรุปรายเขตพร้อมใช้งาน"
      : state === "loading"
        ? "กำลังสรุปข้อมูล"
        : "ข้อมูลยังไม่ครบ";

  return (
    <main className="mx-auto max-w-[1680px] px-3 py-3 sm:px-5">
      <section
        aria-label="ตัวเลือกการวิเคราะห์"
        className="mb-3 rounded-[var(--radius-panel)] border border-[var(--oe-line)] bg-white p-3"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--oe-line-soft)] pb-3">
          <div>
            <p className="text-xs font-semibold text-[var(--oe-primary-ink)]">เลือกเรื่องและดูผลได้ในหน้าเดียว</p>
            <h1 className="mt-1 text-lg font-bold sm:text-xl">{lens.question}</h1>
          </div>
          <div className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-xs font-bold ${
            (dataMode === "gee" ? geeStatus.state === "ready" : districtValuesReady)
              ? "bg-[var(--oe-success-soft)] text-[var(--oe-success-ink)]"
              : "bg-[var(--oe-info-soft)] text-[var(--oe-info-ink)]"
          }`} role="status" aria-live="polite">
            {(dataMode === "gee" ? geeStatus.state === "ready" : districtValuesReady)
              ? <Check className="h-3.5 w-3.5" />
              : <ScanSearch className="h-3.5 w-3.5" />}
            {statusLabel}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_minmax(250px,1.25fr)_minmax(190px,1fr)_130px_130px_minmax(180px,1fr)] xl:items-end">
          <label>
            <span className="mb-1 block text-xs font-semibold text-[var(--oe-muted)]">เรื่องที่ต้องการดู</span>
            <select
              value={lensId}
              onChange={(event) => chooseLens(event.target.value as ObservatoryLensId)}
              className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--oe-line-strong)] bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--oe-primary)] focus:ring-2 focus:ring-[var(--oe-primary-soft)]"
            >
              {OBSERVATORY_LENSES.map((item) => (
                <option key={item.id} value={item.id}>{item.shortTitle}</option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend className="mb-1 text-xs font-semibold text-[var(--oe-muted)]">รูปแบบที่ต้องการดู</legend>
            <div className="grid min-h-11 grid-cols-2 rounded-[var(--radius-control)] border border-[var(--oe-line-strong)] bg-[var(--oe-surface-muted)] p-1">
              <button
                type="button"
                onClick={() => chooseMode("district")}
                aria-pressed={dataMode === "district"}
                className={`inline-flex items-center justify-center gap-2 rounded-[6px] px-2 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)] ${dataMode === "district" ? "bg-white text-[var(--oe-primary-ink)]" : "text-[var(--oe-muted)]"}`}
              >
                <MapIcon className="h-3.5 w-3.5" /> สรุปรายเขต
              </button>
              <button
                type="button"
                onClick={() => chooseMode("gee")}
                disabled={!lens.geeMetric}
                aria-pressed={dataMode === "gee"}
                className={`inline-flex items-center justify-center gap-2 rounded-[6px] px-2 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)] disabled:cursor-not-allowed disabled:opacity-40 ${dataMode === "gee" ? "bg-white text-[var(--oe-primary-ink)]" : "text-[var(--oe-muted)]"}`}
              >
                <Satellite className="h-3.5 w-3.5" /> ภาพดาวเทียมจริง
              </button>
            </div>
          </fieldset>

          <label>
            <span className="mb-1 block text-xs font-semibold text-[var(--oe-muted)]">พื้นที่</span>
            <select
              value={selectedName ?? "bangkok"}
              onChange={(event) => chooseArea(event.target.value)}
              className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--oe-line-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--oe-primary)] focus:ring-2 focus:ring-[var(--oe-primary-soft)]"
            >
              <option value="bangkok">กรุงเทพมหานคร</option>
              {allDistricts.map((feature) => (
                <option key={feature.properties.areaCode} value={feature.properties.nameTh}>
                  {feature.properties.nameTh}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-[var(--oe-muted)]">ปีที่ดู</span>
            <select
              value={year}
              onChange={(event) => {
                const nextYear = Number(event.target.value);
                const nextBaseline = baseline >= nextYear ? nextYear - 1 : baseline;
                setYear(nextYear);
                setBaseline(nextBaseline);
                updateUrl({ nextYear, nextBaseline });
              }}
              className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--oe-line-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--oe-primary)] focus:ring-2 focus:ring-[var(--oe-primary-soft)]"
            >
              {YEARS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-[var(--oe-muted)]">เทียบกับปี</span>
            <select
              value={baseline}
              onChange={(event) => {
                const nextBaseline = Number(event.target.value);
                setBaseline(nextBaseline);
                updateUrl({ nextBaseline });
              }}
              className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--oe-line-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--oe-primary)] focus:ring-2 focus:ring-[var(--oe-primary-soft)]"
            >
              {YEARS.filter((item) => item < year).map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>

          {dataMode === "gee" ? (
            <label>
              <span className="mb-1 block text-xs font-semibold text-[var(--oe-muted)]">สิ่งที่แสดงบนภาพ</span>
              <select
                value={resultMode}
                onChange={(event) => {
                  const nextResultMode = event.target.value as ResultMode;
                  setResultMode(nextResultMode);
                  updateUrl({ nextResultMode });
                }}
                className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--oe-line-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--oe-primary)] focus:ring-2 focus:ring-[var(--oe-primary-soft)]"
              >
                <option value="current">ค่าของปีที่เลือก</option>
                <option value="change">ผลต่างจากปีฐาน</option>
              </select>
            </label>
          ) : (
            <label>
              <span className="mb-1 block text-xs font-semibold text-[var(--oe-muted)]">ฤดูกาล</span>
              <select
                value={season}
                onChange={(event) => {
                  const nextSeason = event.target.value as ObservatorySeason;
                  setSeason(nextSeason);
                  updateUrl({ nextSeason });
                }}
                disabled={lens.id !== "vegetation"}
                className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--oe-line-strong)] bg-white px-3 text-sm outline-none disabled:opacity-50 focus:border-[var(--oe-primary)] focus:ring-2 focus:ring-[var(--oe-primary-soft)]"
              >
                {SEASONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          )}
        </div>
      </section>

      <div className="grid min-h-[720px] gap-3 xl:grid-cols-[230px_minmax(0,1fr)_350px]">
        <aside className="hidden rounded-[var(--radius-panel)] border border-[var(--oe-line)] bg-white p-3 xl:block">
          <div className="flex items-center gap-2 border-b border-[var(--oe-line-soft)] pb-3">
            <Layers3 className="h-4 w-4 text-[var(--oe-primary)]" />
            <h2 className="text-sm font-bold">เลือกเรื่อง</h2>
          </div>
          <div className="mt-2 space-y-1">
            {OBSERVATORY_LENSES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => chooseLens(item.id)}
                aria-pressed={item.id === lensId}
                className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-[var(--radius-control)] px-3 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)] ${
                  item.id === lensId
                    ? "bg-[var(--oe-primary-soft)] font-bold text-[var(--oe-primary-ink)]"
                    : "text-[var(--oe-muted)] hover:bg-[var(--oe-surface-muted)] hover:text-[var(--oe-ink)]"
                }`}
              >
                <span>{item.shortTitle}</span>
                <span className="text-[10px] font-semibold">
                  {item.apiMetric && item.geeMetric ? "ดูได้ 2 แบบ" : item.geeMetric ? "มีภาพ" : item.apiMetric ? "มีสรุป" : "รอข้อมูล"}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-5 rounded-[var(--radius-control)] bg-[var(--oe-surface-muted)] p-3 text-xs leading-5 text-[var(--oe-muted)]">
            เลือกเรื่อง ปี และพื้นที่ด้านบน ระบบจะคำนวณและเปลี่ยนผลให้ทันที
          </div>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--oe-line)] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--oe-line)] px-4 py-3">
            <div>
              <h2 className="text-sm font-bold">{lens.title}</h2>
              <p className="mt-0.5 text-xs text-[var(--oe-muted)]">
                ปี {year}{compare ? ` เทียบ ${baseline}` : ""} · {selectedName ?? "กรุงเทพมหานคร"}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--oe-muted)]">
              <span className={`h-2 w-2 rounded-full ${basemapStatus === "ready" ? "bg-[var(--oe-success)]" : "bg-[var(--oe-warning)]"}`} />
              แผนที่ {basemapStatus === "ready" ? "พร้อม" : basemapStatus === "loading" ? "กำลังโหลด" : "โหลดได้ไม่ครบ"}
            </div>
          </div>

          {dataMode === "district" && state === "research" && (
            <div className="flex items-start gap-3 border-b border-[var(--oe-warning-line)] bg-[var(--oe-warning-soft)] px-4 py-3 text-sm text-[var(--oe-warning-ink)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <strong>ข้อมูลทดลอง ใช้เพื่อประกอบการตรวจสอบ</strong>
                <p className="mt-0.5 leading-6">ควรอ่านร่วมกับที่มา ความครบของข้อมูล และข้อควรระวังก่อนนำไปใช้งาน</p>
              </div>
            </div>
          )}

          {dataMode === "district" && !districtValuesReady && state !== "loading" && (
            <div className="flex items-start gap-3 border-b border-[var(--oe-warning-line)] bg-[var(--oe-warning-soft)] px-4 py-3 text-sm text-[var(--oe-warning-ink)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <strong>ยังสรุปตัวเลขรายเขตไม่ได้</strong>
                <p className="mt-0.5 leading-6">{statusReason}</p>
              </div>
            </div>
          )}

          <div className="relative min-h-[580px]">
            <ObservatoryMap
              geojson={areas}
              trustedValues={mapValuesReady}
              selectedName={selectedName}
              ramp={lens.ramp}
              mode={dataMode}
              geeMetric={lens.geeMetric}
              year={year}
              baseline={baseline}
              compare={compare}
              onSelect={(feature) => chooseArea(feature.properties.nameTh)}
              onBasemapStatus={setBasemapStatus}
              onGeeStatus={setGeeStatus}
              onPointResult={setPointResult}
            />

            {dataMode === "gee" && geeStatus.state === "loading" && (
              <div className="absolute left-3 top-3 z-[400] rounded-[var(--radius-control)] border border-[var(--oe-line)] bg-[var(--oe-surface)] px-3 py-2 text-xs font-semibold shadow-lg">
                กำลังประมวลผลภาพดาวเทียม…
              </div>
            )}
            {dataMode === "gee" && geeStatus.state === "error" && (
              <div className="absolute inset-x-3 top-3 z-[400] rounded-[var(--radius-control)] border border-[var(--oe-warning-line)] bg-[var(--oe-warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--oe-warning-ink)] shadow-lg">
                <strong>ยังเปิดภาพดาวเทียมไม่ได้</strong> {friendlyMessage(geeStatus.message)}
              </div>
            )}
            <div className="absolute bottom-5 right-3 z-[400] w-[230px] rounded-[var(--radius-control)] border border-[var(--oe-line)] bg-[color:var(--oe-surface)]/95 p-3 text-xs shadow-lg">
              <p className="font-bold">
                {dataMode === "district" ? `สีแสดง ${lens.shortTitle}` : compare ? "สีแสดงการเปลี่ยนแปลง" : "ภาพของปีที่เลือก"}
              </p>
              {dataMode === "district" && mapValuesReady ? (
                <div className="mt-2 flex overflow-hidden rounded-full">
                  {lens.ramp.map((color) => <span key={color} className="h-2.5 flex-1" style={{ backgroundColor: color }} />)}
                </div>
              ) : (
                <p className="mt-1 leading-5 text-[var(--oe-muted)]">
                  {dataMode === "gee" ? "คลิกบนภาพเพื่ออ่านค่าจุด และคลิกเขตเพื่อดูสรุป" : "สีเทาหมายถึงยังไม่มีค่าพร้อมแสดง"}
                </p>
              )}
            </div>
          </div>

          <div className="border-t border-[var(--oe-line)] bg-[var(--oe-surface-muted)] px-4 py-3 text-xs text-[var(--oe-muted)]">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="font-bold text-[var(--oe-ink)]">ที่มา: {sourceLabel}</span>
              <span>{sourceStatusText(summary?.dataOrigin)}</span>
              {dataMode === "gee" && typeof geeStatus.sceneCount === "number" && geeStatus.sceneCount >= 0 && (
                <span>ใช้ภาพ {geeStatus.sceneCount.toLocaleString("th-TH")} ภาพ</span>
              )}
              {dataMode === "gee" && geeStatus.resolutionMeters && (
                <span>รายละเอียดภาพประมาณ {geeStatus.resolutionMeters.toLocaleString("th-TH")} เมตร</span>
              )}
            </div>
          </div>
        </section>

        <aside className="rounded-[var(--radius-panel)] border border-[var(--oe-line)] bg-white">
          <div className="border-b border-[var(--oe-line)] p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[var(--oe-primary)]" />
              <h2 className="text-sm font-bold">สรุปที่ควรรู้</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--oe-muted)]">ตัวเลขภาพรวมและเขตที่เลือก อ่านได้ทันที</p>
          </div>

          <div className="grid grid-cols-2 border-b border-[var(--oe-line)]">
            <div className="border-b border-r border-[var(--oe-line-soft)] p-3">
              <p className="text-[11px] text-[var(--oe-muted)]">ค่าเฉลี่ยกรุงเทพฯ</p>
              <p className="mt-1 text-base font-bold tabular-nums">{formatValue(averageValue, lens.decimals, displayUnit)}</p>
            </div>
            <div className="border-b border-[var(--oe-line-soft)] p-3">
              <p className="text-[11px] text-[var(--oe-muted)]">เขตที่มีค่าสูงสุด</p>
              <p className="mt-1 truncate text-sm font-bold">{highest?.properties.nameTh ?? "ยังไม่มีข้อมูล"}</p>
              {highest && <p className="mt-0.5 text-[11px] text-[var(--oe-muted)]">{formatValue(highest.properties.metricValue, lens.decimals, displayUnit)}</p>}
            </div>
            <div className="border-r border-[var(--oe-line-soft)] p-3">
              <p className="text-[11px] text-[var(--oe-muted)]">เปลี่ยนจากปี {baseline}</p>
              <p className="mt-1 text-base font-bold tabular-nums">{formatSignedValue(averageDelta, lens.decimals, displayUnit)}</p>
            </div>
            <div className="p-3">
              <p className="text-[11px] text-[var(--oe-muted)]">เขตที่มีข้อมูล</p>
              <p className="mt-1 text-base font-bold tabular-nums">{validDistricts.toLocaleString("th-TH")} / {totalDistricts.toLocaleString("th-TH")}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 border-b border-[var(--oe-line)] bg-[var(--oe-surface-muted)] px-4 py-3 text-xs">
            <div className="border-r border-[var(--oe-line-soft)] pr-3">
              <p className="text-[var(--oe-muted)]">ช่วงค่าที่พบใน 50 เขต</p>
              <p className="mt-1 font-semibold tabular-nums">
                {formatValue(summary?.minValue, lens.decimals, displayUnit)} – {formatValue(summary?.maxValue, lens.decimals, displayUnit)}
              </p>
            </div>
            <div className="pl-3">
              <p className="text-[var(--oe-muted)]">ความครบของข้อมูล</p>
              <p className="mt-1 font-semibold tabular-nums">
                {typeof summary?.coverageRatio === "number"
                  ? `${(summary.coverageRatio * 100).toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`
                  : "ยังไม่มีข้อมูล"}
              </p>
            </div>
          </div>

          <div className="p-4">
            {dataMode === "gee" && pointResult ? (
              <section className="rounded-[var(--radius-control)] border border-[var(--oe-primary)] bg-[var(--oe-primary-soft)] p-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--oe-primary-ink)]">
                  <MapPinned className="h-3.5 w-3.5" /> จุดที่เลือกบนภาพ
                </div>
                <p className="mt-2 text-xl font-bold tabular-nums">
                  {pointResult.loading ? "กำลังอ่านค่า…" : pointResult.error ? "ยังอ่านค่าไม่ได้" : formatValue(pointResult.value, lens.decimals, displayUnit)}
                </p>
                {pointResult.error && <p className="mt-1 text-xs leading-5 text-[var(--oe-warning-ink)]">{friendlyMessage(pointResult.error)}</p>}
                <p className="mt-1 text-[11px] text-[var(--oe-muted)]">พิกัด {pointResult.lat.toFixed(4)}, {pointResult.lng.toFixed(4)}</p>
              </section>
            ) : selectedFeature ? (
              <section>
                <p className="text-xs font-semibold text-[var(--oe-muted)]">เขตที่เลือก</p>
                <h3 className="mt-1 text-lg font-bold">{selectedFeature.properties.nameTh}</h3>
                <p className="text-xs text-[var(--oe-muted)]">{selectedFeature.properties.nameEn}</p>
                <div className="mt-3 rounded-[var(--radius-control)] bg-[var(--oe-surface-muted)] p-3">
                  <p className="text-xs text-[var(--oe-muted)]">{lens.shortTitle} ปี {year}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{formatValue(selectedFeature.properties.metricValue, lens.decimals, displayUnit)}</p>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--oe-line-soft)] pt-3 text-xs">
                    <span className="text-[var(--oe-muted)]">เทียบปี {baseline}</span>
                    <strong>{formatSignedValue(selectedFeature.properties.metricDelta, lens.decimals, displayUnit)}</strong>
                  </div>
                </div>
              </section>
            ) : (
              <div className="rounded-[var(--radius-control)] bg-[var(--oe-surface-muted)] p-3 text-sm leading-6 text-[var(--oe-muted)]">
                เลือกเขตจากแผนที่หรือช่อง “พื้นที่” เพื่อดูตัวเลขของเขตนั้น
              </div>
            )}

            {sortedAreas.length > 0 && (
              <section className="mt-5 border-t border-[var(--oe-line)] pt-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-[var(--oe-primary)]" />
                  <h3 className="text-xs font-bold">5 เขตที่มีค่าสูง</h3>
                </div>
                <ol className="mt-2 space-y-2">
                  {sortedAreas.slice(0, 5).map((feature, index) => (
                    <li key={feature.properties.areaCode}>
                      <button
                        type="button"
                        onClick={() => chooseArea(feature.properties.nameTh)}
                        className="grid min-h-9 w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--radius-control)] px-1 text-left text-xs outline-none hover:bg-[var(--oe-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)]"
                      >
                        <span className="font-mono text-[var(--oe-muted)]">{index + 1}</span>
                        <span className="truncate font-semibold">{feature.properties.nameTh}</span>
                        <span className="font-mono">{formatValue(feature.properties.metricValue, lens.decimals, displayUnit)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section className="mt-5 space-y-4 border-t border-[var(--oe-line)] pt-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold"><Sparkles className="h-3.5 w-3.5" /> อ่านค่านี้อย่างไร</div>
                <p className="mt-1 text-xs leading-5 text-[var(--oe-muted)]">{lens.method}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs font-bold"><Database className="h-3.5 w-3.5" /> แหล่งข้อมูล</div>
                <p className="mt-1 text-xs leading-5 text-[var(--oe-muted)]">{sourceLabel}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs font-bold"><AlertTriangle className="h-3.5 w-3.5" /> ต้องระวัง</div>
                <p className="mt-1 text-xs leading-5 text-[var(--oe-muted)]">{lens.limitation}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs font-bold"><ArrowDownUp className="h-3.5 w-3.5" /> ควรดูร่วมกับ</div>
                <p className="mt-1 text-xs leading-5 text-[var(--oe-muted)]">{lens.verifyWith}</p>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </main>
  );
}

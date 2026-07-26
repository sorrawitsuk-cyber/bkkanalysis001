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
  status?: "available" | "unavailable";
  period?: { year: number; baseline: number };
  observations?: Array<{
    areaCode: string;
    statistic: string;
    value: number;
    unit: string;
    coverage: number | null;
  }>;
  summary?: {
    averageValue: number | null;
    observationCount: number;
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
  };
  reason?: string | null;
  error?: string;
};

type DataState = "loading" | "available" | "withheld" | "planned" | "error";
type ViewMode = "map" | "table";

type ObservatoryWorkspaceProps = {
  initialLens: ObservatoryLensId;
  initialYear: number;
  initialBaseline: number;
  initialArea: string;
};

const YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];

function formatValue(value: number | null | undefined, decimals: number, unit: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "ไม่มีค่าที่ผ่านเงื่อนไข";
  const formatted = value.toLocaleString("th-TH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return unit === "NDVI" || unit === "NDBI" ? `${formatted} ${unit}` : `${formatted} ${unit}`;
}

function qualityText(state: DataState) {
  if (state === "available") return "ข้อมูลสังเกตพร้อมอ่าน";
  if (state === "withheld") return "ระงับการแสดงค่าที่ไม่ผ่านนโยบาย";
  if (state === "planned") return "อยู่ระหว่าง data acceptance";
  if (state === "error") return "ตรวจสถานะข้อมูลไม่ได้";
  return "กำลังตรวจหลักฐานข้อมูล";
}

export default function ObservatoryWorkspace({
  initialLens,
  initialYear,
  initialBaseline,
  initialArea,
}: ObservatoryWorkspaceProps) {
  const router = useRouter();
  const [lensId, setLensId] = useState<ObservatoryLensId>(initialLens);
  const [year, setYear] = useState(initialYear);
  const [baseline, setBaseline] = useState(initialBaseline);
  const [areas, setAreas] = useState<AreaCollection | null>(null);
  const [observationPayload, setObservationPayload] = useState<ObservationPayload | null>(null);
  const [state, setState] = useState<DataState>("loading");
  const [statusReason, setStatusReason] = useState("");
  const [view, setView] = useState<ViewMode>("map");
  const [selectedName, setSelectedName] = useState<string | null>(
    initialArea !== "bangkok" ? initialArea : null,
  );
  const [appliedArea, setAppliedArea] = useState(initialArea);
  const lens = getObservatoryLens(lensId);
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
  }, [baseline, lens.apiMetric, lens.id, year]);

  const mergedAreas = useMemo<AreaCollection | null>(() => {
    if (!areas) return null;
    if (state !== "available" || !observationPayload?.observations) return areas;

    const byAreaCode = new Map(
      observationPayload.observations.map((observation) => [observation.areaCode, observation.value]),
    );

    return {
      ...areas,
      features: areas.features.map((feature) => {
        const rawValue = byAreaCode.get(feature.properties.areaCode);
        return {
          ...feature,
          properties: {
            ...feature.properties,
            metricValue: typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : null,
          },
        };
      }),
    };
  }, [areas, observationPayload, state]);

  const selectedFeature = useMemo(
    () => mergedAreas?.features.find((feature) => feature.properties.nameTh === selectedName) ?? null,
    [mergedAreas, selectedName],
  );

  const sortedAreas = useMemo(() => {
    if (!mergedAreas) return [];
    return [...mergedAreas.features].sort((a, b) => {
      if (state === "available") {
        return (b.properties.metricValue ?? -Infinity) - (a.properties.metricValue ?? -Infinity);
      }
      return a.properties.nameTh.localeCompare(b.properties.nameTh, "th");
    });
  }, [mergedAreas, state]);

  const updateUrl = useCallback((next?: {
    lens?: ObservatoryLensId;
    nextYear?: number;
    nextBaseline?: number;
    area?: string;
  }) => {
    const params = new URLSearchParams({
      lens: next?.lens ?? lensId,
      year: String(next?.nextYear ?? year),
      baseline: String(next?.nextBaseline ?? baseline),
      area: next?.area ?? appliedArea,
    });
    router.replace(`/observatory?${params.toString()}`, { scroll: false });
  }, [appliedArea, baseline, lensId, router, year]);

  function chooseLens(nextLens: ObservatoryLensId) {
    setLensId(nextLens);
    setSelectedName(null);
    setAppliedArea("bangkok");
    updateUrl({ lens: nextLens, area: "bangkok" });
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
              {YEARS.map((item) => <option key={item}>{item}</option>)}
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
              {YEARS.filter((item) => item < year).map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <div className={`flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-3 text-sm font-semibold ${
            state === "available"
              ? "bg-[var(--oe-success-soft)] text-[var(--oe-success-ink)]"
              : state === "loading"
                ? "bg-[var(--oe-info-soft)] text-[var(--oe-info-ink)]"
                : "bg-[var(--oe-warning-soft)] text-[var(--oe-warning-ink)]"
          }`}>
            {state === "available" ? <Check className="h-4 w-4" /> : state === "loading" ? <ScanSearch className="h-4 w-4" /> : <CircleOff className="h-4 w-4" />}
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
              <p className="mt-0.5 text-xs text-[var(--oe-muted)]">ปี {year} เทียบปีฐาน {baseline} · หน่วยพื้นที่ เขต</p>
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

          {state !== "available" && state !== "loading" && (
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
                trustedValues={state === "available"}
                selectedName={selectedName}
                ramp={lens.ramp}
                onSelect={(feature) => setSelectedName(feature.properties.nameTh)}
              />
              <div className="absolute bottom-4 right-4 z-[400] max-w-[250px] rounded-[var(--radius-control)] border border-[var(--oe-line)] bg-white/95 p-3 text-xs">
                <p className="font-bold">{state === "available" ? `ช่วงสี ${lens.unit}` : "ขอบเขตพื้นที่เท่านั้น"}</p>
                {state === "available" ? (
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
                    <th className="px-4 py-3 text-right font-bold">{lens.unit}</th>
                    <th className="w-12 px-3 py-3"><span className="sr-only">เลือก</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAreas.map((feature) => (
                    <tr key={feature.properties.areaCode} className="border-t border-[var(--oe-line-soft)] hover:bg-[var(--oe-surface-muted)]">
                      <td className="px-4 py-3 font-semibold">{feature.properties.nameTh}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--oe-muted)]">{feature.properties.areaCode}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {state === "available"
                          ? formatValue(feature.properties.metricValue, lens.decimals, lens.unit)
                          : "ระงับการแสดง"}
                      </td>
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
              <span>{lens.source}</span>
              <span>{lens.resolution}</span>
              <span>ปี {year}</span>
              <span title={boundaryVersion}>
                Boundary: {areas?.meta?.qualityStatus ?? "กำลังตรวจ"} · {boundaryLabel}
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
                    {state === "available"
                      ? formatValue(selectedFeature.properties.metricValue, lens.decimals, lens.unit)
                      : "ยังไม่มีค่าที่ผ่าน QA"}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[var(--oe-muted)]">
                    {state === "available"
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

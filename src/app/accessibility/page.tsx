/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Bus,
  Cross,
  Database,
  GraduationCap,
  Info,
  Layers3,
  MapPin,
  RefreshCw,
  Search,
  ShoppingBasket,
  SlidersHorizontal,
  Trees,
  Users,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ViewTabs, { type ViewMode } from "@/components/ui/ViewTabs";
import MapSkeleton from "@/components/ui/MapSkeleton";
import {
  ACCESSIBILITY_CATEGORIES,
  ACCESSIBILITY_LABELS,
  accessibilityColor,
  accessibilityLevel,
  accessibilityValue,
  type AccessibilityBasis,
  type AccessibilityCategory,
  type AccessibilityDistrict,
  type AccessibilityMetric,
  type AccessibilityScenario,
  type AccessibilityService,
} from "@/lib/accessibility";

const AccessibilityMap = dynamic(
  () => import("@/components/map/AccessibilityMap"),
  { ssr: false, loading: () => <MapSkeleton /> },
);

const CATEGORY_ICONS = {
  health: Cross,
  education: GraduationCap,
  food: ShoppingBasket,
  recreation: Trees,
  transit: Bus,
};

const METRICS: Array<{ value: AccessibilityMetric; label: string }> = [
  { value: "accessibility_score", label: "การเข้าถึงเฉลี่ย 5 หมวด" },
  { value: "complete_coverage_pct", label: "ครบทั้ง 5 หมวด" },
  ...ACCESSIBILITY_CATEGORIES.map((category) => ({
    value: category,
    label: ACCESSIBILITY_LABELS[category],
  })),
];

function formatNumber(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  note: string;
  icon: any;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/65 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className={`mt-2 text-2xl font-black tabular-nums ${color}`}>{value}</div>
      <p className="mt-1 text-[10px] text-slate-500">{note}</p>
    </div>
  );
}

export default function AccessibilityPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("map");
  const [metric, setMetric] = useState<AccessibilityMetric>("accessibility_score");
  const [basis, setBasis] = useState<AccessibilityBasis>("population");
  const [scenario, setScenario] = useState<AccessibilityScenario>("standard");
  const [category, setCategory] = useState<AccessibilityCategory | "all">("all");
  const [activeDistrictId, setActiveDistrictId] = useState<number | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showServices, setShowServices] = useState(true);
  const [sortKey, setSortKey] = useState<
    AccessibilityMetric | "district_name" | "services_per_10000" | "underserved_population"
  >("accessibility_score");
  const [descending, setDescending] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/accessibility", { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "โหลดข้อมูลไม่สำเร็จ");
        return body;
      })
      .then(setData)
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(reason.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const rows = useMemo<AccessibilityDistrict[]>(
    () => data?.districts ?? [],
    [data?.districts],
  );
  const overview = useMemo<AccessibilityDistrict | null>(() => {
    if (!rows.length) return null;
    const average = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    return {
      district_id: 0,
      district_name: "กรุงเทพมหานคร",
      population: rows.reduce((sum, row) => sum + row.population, 0),
      sample_count: rows.reduce((sum, row) => sum + row.sample_count, 0),
      service_count: data?.summary?.service_count ?? 0,
      services_per_10000: null,
      accessibility_score: data?.summary?.average_accessibility_score ?? 0,
      inclusive_accessibility_score:
        data?.summary?.inclusive_average_accessibility_score ?? 0,
      area_accessibility_score:
        data?.summary?.average_area_accessibility_score ?? 0,
      inclusive_area_accessibility_score: average(
        rows.map((row) => row.inclusive_area_accessibility_score),
      ),
      complete_coverage_pct: data?.summary?.average_complete_coverage_pct ?? 0,
      inclusive_complete_coverage_pct: average(
        rows.map((row) => row.inclusive_complete_coverage_pct),
      ),
      area_complete_coverage_pct:
        data?.summary?.average_area_complete_coverage_pct ?? 0,
      inclusive_area_complete_coverage_pct: average(
        rows.map((row) => row.inclusive_area_complete_coverage_pct),
      ),
      complete_covered_population:
        data?.summary?.complete_covered_population ?? 0,
      underserved_population: data?.summary?.underserved_population ?? 0,
      represented_population: rows.reduce(
        (sum, row) => sum + row.represented_population,
        0,
      ),
      rank: 0,
      categories: Object.fromEntries(
        ACCESSIBILITY_CATEGORIES.map((item) => [
          item,
          {
            coverage_pct: average(rows.map((row) => row.categories[item].coverage_pct)),
            inclusive_coverage_pct: average(
              rows.map((row) => row.categories[item].inclusive_coverage_pct),
            ),
            area_coverage_pct: average(
              rows.map((row) => row.categories[item].area_coverage_pct),
            ),
            inclusive_area_coverage_pct: average(
              rows.map((row) => row.categories[item].inclusive_area_coverage_pct),
            ),
            median_minutes: average(
              rows
                .map((row) => row.categories[item].median_minutes)
                .filter((value): value is number => value !== null),
            ),
            p90_minutes: average(
              rows
                .map((row) => row.categories[item].p90_minutes)
                .filter((value): value is number => value !== null),
            ),
            area_median_minutes: average(
              rows
                .map((row) => row.categories[item].area_median_minutes)
                .filter((value): value is number => value !== null),
            ),
            area_p90_minutes: average(
              rows
                .map((row) => row.categories[item].area_p90_minutes)
                .filter((value): value is number => value !== null),
            ),
            covered_population: rows.reduce(
              (sum, row) => sum + row.categories[item].covered_population,
              0,
            ),
            inclusive_covered_population: rows.reduce(
              (sum, row) => sum + row.categories[item].inclusive_covered_population,
              0,
            ),
            service_count: data?.summary?.category_totals?.[item] ?? 0,
          },
        ]),
      ) as AccessibilityDistrict["categories"],
    };
  }, [data?.summary, rows]);
  const selected =
    rows.find((row) => row.district_id === activeDistrictId) ?? overview;
  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortKey === "district_name") {
        return a.district_name.localeCompare(b.district_name, "th") * (descending ? -1 : 1);
      }
      const av =
        sortKey === "services_per_10000"
          ? a.services_per_10000 ?? -Infinity
          : sortKey === "underserved_population"
            ? a.underserved_population
          : accessibilityValue(a, sortKey as AccessibilityMetric, basis, scenario);
      const bv =
        sortKey === "services_per_10000"
          ? b.services_per_10000 ?? -Infinity
          : sortKey === "underserved_population"
            ? b.underserved_population
          : accessibilityValue(b, sortKey as AccessibilityMetric, basis, scenario);
      return (av - bv) * (descending ? -1 : 1);
    });
    return copy;
  }, [basis, descending, rows, scenario, sortKey]);
  const selectedService: AccessibilityService | null =
    data?.services?.find(
      (service: AccessibilityService) => service.id === selectedServiceId,
    ) ?? null;
  const searchResults = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("th");
    if (term.length < 2) return [];
    const districtResults = rows
      .filter((row) => row.district_name.toLocaleLowerCase("th").includes(term))
      .slice(0, 5)
      .map((row) => ({ type: "district" as const, row }));
    const serviceResults = ((data?.services ?? []) as AccessibilityService[])
      .filter((service) =>
        `${service.name} ${service.district_name ?? ""}`
          .toLocaleLowerCase("th")
          .includes(term),
      )
      .slice(0, 8)
      .map((service) => ({ type: "service" as const, service }));
    return [...districtResults, ...serviceResults];
  }, [data?.services, rows, search]);
  const selectedValue = selected
    ? accessibilityValue(selected, metric, basis, scenario)
    : 0;
  const chartRows = useMemo(
    () =>
      [...rows]
        .sort(
          (a, b) =>
            accessibilityValue(b, metric, basis, scenario) -
            accessibilityValue(a, metric, basis, scenario),
        )
        .slice(0, 15)
        .map((row) => ({
          ...row,
          displayValue: accessibilityValue(row, metric, basis, scenario),
        })),
    [basis, metric, rows, scenario],
  );

  function selectCategory(next: AccessibilityCategory | "all") {
    setCategory(next);
    if (next !== "all") setMetric(next);
  }

  function changeSort(key: typeof sortKey) {
    if (sortKey === key) setDescending((value) => !value);
    else {
      setSortKey(key);
      setDescending(key !== "district_name");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> กำลังโหลดข้อมูลการเข้าถึงบริการเมือง
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-red-300">
        {error || "ไม่พบข้อมูล"}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950/95 px-4 py-3">
        <Link href="/" className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-base font-black">การเข้าถึงบริการเมือง · 15-Minute City</h1>
          <p className="text-[10px] text-slate-500">
            ประเมินทั้งประชากรและพื้นที่ · 5 หมวดบริการ · ครบ 50 เขต
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ViewTabs view={view} onChange={setView} accentColor="emerald" />
          <button
            type="button"
            onClick={() => setShowMobileFilters(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-[10px] font-bold text-slate-300 lg:hidden"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            ตัวกรอง
          </button>
          <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-[10px]">
            {(["population", "area"] as AccessibilityBasis[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setBasis(item)}
                className={`rounded-md px-2.5 py-1.5 font-bold ${
                  basis === item
                    ? "bg-emerald-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {item === "population" ? "ประชากร" : "พื้นที่"}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-[10px]">
            {(["standard", "inclusive"] as AccessibilityScenario[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setScenario(item)}
                className={`rounded-md px-2.5 py-1.5 font-bold ${
                  scenario === item
                    ? "bg-cyan-700 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {item === "standard" ? "เดิน 5 กม./ชม." : "เดิน 4 กม./ชม."}
              </button>
            ))}
          </div>
          <select
            value={metric}
            onChange={(event) => setMetric(event.target.value as AccessibilityMetric)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs"
          >
            {METRICS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {showMobileFilters && (
          <button
            type="button"
            aria-label="ปิดแผงตัวกรอง"
            onClick={() => setShowMobileFilters(false)}
            className="fixed inset-0 z-[1900] bg-slate-950/75 backdrop-blur-sm lg:hidden"
          />
        )}
        <aside
          className={`shrink-0 overflow-y-auto border border-slate-800 bg-slate-900 p-4 ${
            showMobileFilters
              ? "fixed inset-x-3 bottom-3 top-3 z-[2000] block rounded-2xl shadow-2xl"
              : "hidden"
          } lg:static lg:block lg:w-80 lg:rounded-none lg:border-y-0 lg:border-l-0 lg:bg-slate-900/55 lg:shadow-none`}
        >
          <div className="mb-3 flex items-center justify-between lg:hidden">
            <div className="text-xs font-black">ค้นหาและตัวกรอง</div>
            <button
              type="button"
              onClick={() => setShowMobileFilters(false)}
              aria-label="ปิดตัวกรอง"
              className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 text-emerald-300">
              <MapPin className="h-5 w-5" />
              <h2 className="text-sm font-black">พื้นที่ใกล้บริการแค่ไหน</h2>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
              ประเมินจากจุดตัวอย่างทุก 250 เมตร ระยะตรงคูณ detour factor 1.25 และเวลาเดิน
              ตาม scenario ที่เลือก เกณฑ์ 15 นาที ผลนี้เป็น proximity screening
              ไม่ใช่เวลาเดินจากโครงข่ายทางเท้าจริง
            </p>
          </div>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-600" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาเขตหรือจุดบริการ"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-8 text-xs outline-none focus:border-emerald-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="ล้างคำค้น"
                className="absolute right-2 top-2 rounded p-0.5 text-slate-500 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {searchResults.length > 0 && (
              <div className="absolute z-[1200] mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-1 shadow-2xl">
                {searchResults.map((result) => (
                  <button
                    key={
                      result.type === "district"
                        ? `district-${result.row.district_id}`
                        : result.service.id
                    }
                    type="button"
                    onClick={() => {
                      if (result.type === "district") {
                        setActiveDistrictId(result.row.district_id);
                        setSelectedServiceId(null);
                      } else {
                        setActiveDistrictId(result.service.district_id);
                        setSelectedServiceId(result.service.id);
                        setCategory(result.service.category);
                        setShowServices(true);
                      }
                      setSearch("");
                      setShowMobileFilters(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-800"
                  >
                    {result.type === "district" ? (
                      <Layers3 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <MapPin className="h-4 w-4 text-cyan-400" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-bold">
                        {result.type === "district"
                          ? `เขต${result.row.district_name}`
                          : result.service.name}
                      </span>
                      <span className="block truncate text-[9px] text-slate-500">
                        {result.type === "district"
                          ? `อันดับ ${result.row.rank}/50`
                          : `${ACCESSIBILITY_LABELS[result.service.category]} · เขต${result.service.district_name ?? "ไม่ทราบ"}`}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="mt-4 block text-[9px] font-bold uppercase tracking-widest text-slate-500">
            เลือกเขต
          </label>
          <select
            value={activeDistrictId ?? ""}
            onChange={(event) => {
              setActiveDistrictId(event.target.value ? Number(event.target.value) : null);
              setSelectedServiceId(null);
            }}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs"
          >
            <option value="">กรุงเทพมหานครทั้งหมด</option>
            {[...rows].sort((a, b) => a.district_name.localeCompare(b.district_name, "th")).map((row) => (
              <option key={row.district_id} value={row.district_id}>เขต{row.district_name}</option>
            ))}
          </select>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <div className="text-[9px] text-slate-500">
                {basis === "population" ? "ประชากรเข้าถึงเฉลี่ย" : "พื้นที่เข้าถึงเฉลี่ย"}
              </div>
              <div className="mt-1 text-2xl font-black text-emerald-400">
                {formatNumber(selectedValue)}%
              </div>
              <div className="text-[9px] text-slate-500">
                {accessibilityLevel(selectedValue)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <div className="text-[9px] text-slate-500">ครบทั้ง 5 หมวด</div>
              <div className="mt-1 text-2xl font-black text-cyan-400">
                {formatNumber(
                  selected
                    ? accessibilityValue(
                        selected,
                        "complete_coverage_pct",
                        basis,
                        scenario,
                      )
                    : 0,
                )}%
              </div>
              <div className="text-[9px] text-slate-500">
                {activeDistrictId ? `อันดับ ${selected?.rank}/50` : "ค่าเฉลี่ยรายเขต"}
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {ACCESSIBILITY_CATEGORIES.map((item) => {
              const Icon = CATEGORY_ICONS[item];
              const categoryMetric = selected?.categories[item];
              const value = selected
                ? accessibilityValue(selected, item, basis, scenario)
                : 0;
              return (
                <button
                  key={item}
                  onClick={() => selectCategory(category === item ? "all" : item)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    category === item
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : "border-slate-800 bg-slate-950/55 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-emerald-400" />
                    <span className="flex-1 text-[10px] font-bold">{ACCESSIBILITY_LABELS[item]}</span>
                    <span className="text-xs font-black">{formatNumber(value)}%</span>
                  </div>
                  <div className="mt-1 flex justify-between text-[9px] text-slate-500">
                    <span>
                      มัธยฐาน {formatNumber(
                        basis === "population"
                          ? categoryMetric?.median_minutes
                          : categoryMetric?.area_median_minutes,
                      )} นาที
                    </span>
                    <span>
                      {categoryMetric?.service_count ?? 0} แห่ง
                      {activeDistrictId ? "ในเขต" : "ทั่วกรุงเทพฯ"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <label className="mt-4 flex items-center gap-2 text-[10px] text-slate-400">
            <input
              type="checkbox"
              checked={showServices}
              onChange={(event) => setShowServices(event.target.checked)}
              className="accent-emerald-500"
            />
            แสดงจุดบริการบนแผนที่
          </label>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto">
          {view === "map" && (
            <div className="relative h-full min-h-[560px]">
              <AccessibilityMap
                geojson={data.geojson}
                districts={rows}
                services={data.services}
                metric={metric}
                basis={basis}
                scenario={scenario}
                category={category}
                activeDistrictId={activeDistrictId}
                selectedServiceId={selectedServiceId}
                showServices={showServices}
                onSelectDistrict={(district) => {
                  setActiveDistrictId(district.district_id);
                  setSelectedServiceId(null);
                }}
                onSelectService={(service) =>
                  setSelectedServiceId(service?.id ?? null)
                }
              />
              {selectedService && (
                <div className="absolute bottom-24 right-4 z-[1000] w-[min(340px,calc(100%-2rem))] rounded-2xl border border-cyan-500/30 bg-slate-950/95 p-4 shadow-2xl backdrop-blur">
                  <button
                    type="button"
                    onClick={() => setSelectedServiceId(null)}
                    aria-label="ปิดรายละเอียดจุดบริการ"
                    className="absolute right-3 top-3 rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="pr-8 text-sm font-black text-slate-100">
                    {selectedService.name}
                  </div>
                  <div className="mt-1 text-[10px] font-bold text-cyan-400">
                    {ACCESSIBILITY_LABELS[selectedService.category]} · เขต
                    {selectedService.district_name ?? "ไม่ทราบ"}
                  </div>
                  <div className="mt-3 border-t border-slate-800 pt-3 text-[10px] leading-5 text-slate-400">
                    <div>ประเภทข้อมูล: {selectedService.subtype}</div>
                    <div>แหล่งข้อมูล: {selectedService.source}</div>
                    <div className="font-mono text-slate-600">
                      {selectedService.lat.toFixed(5)}, {selectedService.lng.toFixed(5)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {view === "stats" && (
            <div className="space-y-5 p-4 md:p-6">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="จุดบริการ"
                  value={data.summary.service_count.toLocaleString("th-TH")}
                  note="ผ่านการตรวจพิกัดและตัดรายการซ้ำ"
                  icon={MapPin}
                  color="text-emerald-400"
                />
                <MetricCard
                  label="ประชากรเข้าถึงเฉลี่ย"
                  value={`${formatNumber(
                    scenario === "standard"
                      ? data.summary.average_accessibility_score
                      : data.summary.inclusive_average_accessibility_score,
                  )}%`}
                  note="ถ่วงด้วยประชากรทะเบียนระดับแขวง"
                  icon={Database}
                  color="text-cyan-400"
                />
                <MetricCard
                  label="ประชากรยังไม่ครบ 5 หมวด"
                  value={data.summary.underserved_population.toLocaleString("th-TH")}
                  note="ค่าประมาณจากการกระจายประชากรภายในแขวง"
                  icon={Users}
                  color="text-violet-400"
                />
                <MetricCard
                  label="จุดประเมิน"
                  value={data.summary.sample_count.toLocaleString("th-TH")}
                  note="ตารางตัวอย่างระยะห่าง 250 เมตร"
                  icon={MapPin}
                  color="text-amber-400"
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4">
                  <h2 className="text-sm font-black">15 เขตที่มีค่าสูงสุดตามตัวเลือกปัจจุบัน</h2>
                  <ResponsiveContainer width="100%" height={420}>
                    <BarChart data={chartRows} layout="vertical" margin={{ left: 20, top: 15 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis type="number" domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 10 }} />
                      <YAxis dataKey="district_name" type="category" width={82} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
                        formatter={(value) => [`${value}%`, "คะแนน"]}
                      />
                      <Bar dataKey="displayValue" radius={[0, 5, 5, 0]}>
                        {chartRows.map((row) => (
                          <Cell key={row.district_id} fill={accessibilityColor(row.displayValue)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-4">
                  <h2 className="text-sm font-black">Coverage รายหมวดของเขตที่เลือก</h2>
                  <p className="mt-1 text-[10px] text-slate-500">
                    เปรียบเทียบเกณฑ์มาตรฐาน 5 กม./ชม. กับเกณฑ์เดินช้า 4 กม./ชม.
                  </p>
                  <ResponsiveContainer width="100%" height={420}>
                    <BarChart
                      data={ACCESSIBILITY_CATEGORIES.map((item) => ({
                        name: ACCESSIBILITY_LABELS[item],
                        standard: selected
                          ? accessibilityValue(selected, item, basis, "standard")
                          : 0,
                        inclusive: selected
                          ? accessibilityValue(selected, item, basis, "inclusive")
                          : 0,
                      }))}
                      margin={{ top: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
                      <Legend />
                      <Bar dataKey="standard" name="เดิน 5 กม./ชม." fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="inclusive" name="เดิน 4 กม./ชม." fill="#38bdf8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {view === "table" && (
            <div className="p-4 md:p-6">
              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full min-w-[1100px] text-left text-xs">
                  <thead className="bg-slate-900 text-[9px] uppercase tracking-wider text-slate-500">
                    <tr>
                      {[
                        ["district_name", "เขต"],
                        ["accessibility_score", "เฉลี่ย 5 หมวด"],
                        ["complete_coverage_pct", "ครบ 5 หมวด"],
                        ["health", "สุขภาพ"],
                        ["education", "การศึกษา"],
                        ["food", "อาหาร"],
                        ["recreation", "นันทนาการ"],
                        ["transit", "ขนส่ง"],
                        ["underserved_population", "ประชากรยังไม่ครบ"],
                        ["services_per_10000", "บริการ/10,000 คน"],
                      ].map(([key, label]) => (
                        <th
                          key={key}
                          onClick={() => changeSort(key as typeof sortKey)}
                          className="cursor-pointer px-3 py-3 hover:text-white"
                        >
                          {label}{sortKey === key ? (descending ? " ↓" : " ↑") : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row) => (
                      <tr
                        key={row.district_id}
                        onClick={() => {
                          setActiveDistrictId(row.district_id);
                          setSelectedServiceId(null);
                          setView("map");
                        }}
                        className="cursor-pointer border-t border-slate-800 bg-slate-950/40 hover:bg-slate-900"
                      >
                        <td className="px-3 py-3 font-bold">เขต{row.district_name}<span className="ml-2 text-[9px] text-slate-600">#{row.rank}</span></td>
                        <td
                          className="px-3 py-3 font-black"
                          style={{
                            color: accessibilityColor(
                              accessibilityValue(
                                row,
                                "accessibility_score",
                                basis,
                                scenario,
                              ),
                            ),
                          }}
                        >
                          {formatNumber(
                            accessibilityValue(
                              row,
                              "accessibility_score",
                              basis,
                              scenario,
                            ),
                          )}%
                        </td>
                        <td className="px-3 py-3">
                          {formatNumber(
                            accessibilityValue(
                              row,
                              "complete_coverage_pct",
                              basis,
                              scenario,
                            ),
                          )}%
                        </td>
                        {ACCESSIBILITY_CATEGORIES.map((item) => (
                          <td key={item} className="px-3 py-3">
                            {formatNumber(
                              accessibilityValue(row, item, basis, scenario),
                            )}%
                          </td>
                        ))}
                        <td className="px-3 py-3">
                          {row.underserved_population.toLocaleString("th-TH")}
                        </td>
                        <td className="px-3 py-3">{formatNumber(row.services_per_10000, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {view === "guide" && (
            <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-7">
              <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                <div className="flex items-center gap-2 text-emerald-300">
                  <BookOpen className="h-5 w-5" />
                  <h2 className="text-base font-black">วิธีอ่านผลอย่างถูกต้อง</h2>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  มุมมองประชากรแสดงสัดส่วนประชากรโดยประมาณที่อยู่ใกล้บริการภายในเวลาเทียบเท่า
                  15 นาที โดยกระจายประชากรทะเบียนสม่ำเสมอในจุดตัวอย่างของแต่ละแขวง
                  ส่วนมุมมองพื้นที่ให้น้ำหนักทุกจุดเท่ากัน ทั้งสองแบบไม่ใช่เวลาเดินจาก routing engine
                  และเหมาะสำหรับคัดกรองพื้นที่เพื่อตรวจภาคสนามต่อ
                </p>
              </section>

              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-2xl border border-slate-800 bg-slate-900/55 p-5">
                  <h3 className="font-black">ขั้นตอนคำนวณ</h3>
                  <ol className="mt-3 space-y-2 text-xs leading-6 text-slate-400">
                    <li>1. ตรวจพิกัดให้อยู่ในกรุงเทพฯ และ spatial join กับขอบเขต 50 เขต</li>
                    <li>2. สร้างจุดตารางทุก 250 เมตรภายในแต่ละเขต รวม {data.summary.sample_count.toLocaleString("th-TH")} จุด</li>
                    <li>3. หาบริการที่ใกล้ที่สุดในแต่ละหมวดด้วยระยะ geodesic</li>
                    <li>4. คูณ route-detour factor 1.25 เพื่อประมาณความคดเคี้ยวของเส้นทาง</li>
                    <li>5. แปลงเป็นเวลาเดิน 5 กม./ชม. และ sensitivity test ที่ 4 กม./ชม.</li>
                    <li>6. กระจายประชากรทะเบียนปี {data.metadata.population_year} ของแต่ละแขวงให้จุดในแขวงเป็นน้ำหนัก</li>
                    <li>7. ค่าการเข้าถึงเฉลี่ยคือ coverage ของ 5 หมวดโดยให้น้ำหนักแต่ละหมวดเท่ากัน</li>
                  </ol>
                </section>
                <section className="rounded-2xl border border-slate-800 bg-slate-900/55 p-5">
                  <h3 className="font-black">ข้อจำกัดสำคัญ</h3>
                  <ul className="mt-3 space-y-2 text-xs leading-6 text-slate-400">
                    <li>• ยังไม่รวมโครงข่ายทางเท้า สะพาน ทางเข้า และเวลารอสัญญาณ</li>
                    <li>• น้ำหนักประชากรยังสมมติว่ากระจายสม่ำเสมอภายในแขวง ไม่ใช่ตำแหน่งที่พักอาศัยจริงรายกริด</li>
                    <li>• การมีสถานที่ไม่ได้ยืนยันกำลังรองรับ คุณภาพ ค่าใช้จ่าย หรือเวลาเปิด</li>
                    <li>• ตลาดใช้เป็นตัวแทนการเข้าถึงอาหาร ไม่ครอบคลุมร้านค้าปลีกทั้งหมด</li>
                    <li>• ขนส่งสาธารณะยังครอบคลุมเฉพาะ BTS/MRT และสุขภาพยังครอบคลุมเฉพาะศูนย์บริการสาธารณสุข กทม.</li>
                    <li>• การเดินในอากาศร้อน ฝนตก หรือสำหรับผู้พิการอาจใช้เวลามากกว่าเกณฑ์</li>
                  </ul>
                </section>
              </div>

              <section className="rounded-2xl border border-slate-800 bg-slate-900/55 p-5">
                <h3 className="flex items-center gap-2 font-black"><Database className="h-4 w-4 text-cyan-400" /> แหล่งข้อมูลที่ใช้จริง</h3>
                <div className="mt-3 grid gap-2">
                  {data.metadata.sources.map((source: any) => (
                    <a
                      key={`${source.key}-${source.subtype}`}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 hover:border-cyan-700"
                    >
                      <div className="text-xs font-bold text-slate-200">{source.dataset}</div>
                      <div className="mt-1 text-[10px] text-slate-500">
                        รับ {source.rows_received.toLocaleString("th-TH")} แถว · ใช้ {source.rows_accepted.toLocaleString("th-TH")} แถว · ตัดออก {source.rows_rejected.toLocaleString("th-TH")} แถว
                      </div>
                    </a>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5 text-xs leading-6 text-slate-400">
                <h3 className="flex items-center gap-2 font-black text-blue-300"><Info className="h-4 w-4" /> กรอบอ้างอิง</h3>
                <p className="mt-2">
                  แนวคิด 15-Minute City เน้น proximity, diversity, density และ ubiquity
                  ส่วน UN-Habitat แนะนำให้ประเมินการเข้าถึงพื้นที่สาธารณะผ่านโครงข่ายถนน
                  ระบบนี้ใช้วิธี proximity screening เนื่องจากข้อมูลโครงข่ายทางเท้าที่ตรวจสอบแล้ว
                  ยังไม่ครบทั้งกรุงเทพฯ จึงแสดงข้อจำกัดและ sensitivity scenario แทนการอ้างว่าเป็นเวลาเดินจริง
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <a
                    href="https://doi.org/10.3390/smartcities4010006"
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-blue-300 hover:text-blue-200"
                  >
                    Moreno et al. (2021)
                  </a>
                  <a
                    href="https://unhabitat.org/sites/default/files/2020/07/indicator_11.7.1_training_module_public_space.pdf"
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-blue-300 hover:text-blue-200"
                  >
                    UN-Habitat SDG 11.7.1 methodology
                  </a>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

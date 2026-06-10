/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Database,
  Droplets,
  Flame,
  Gauge,
  MapPin,
  RefreshCw,
} from "lucide-react";
import MapSkeleton from "@/components/ui/MapSkeleton";
import type { DecisionMode } from "@/lib/decision-support";

const DecisionSupportMap = dynamic(
  () => import("@/components/map/DecisionSupportMap"),
  { ssr: false, loading: () => <MapSkeleton /> },
);

const YEARS = Array.from({ length: 9 }, (_, index) => 2026 - index);

function formatValue(value: number | null) {
  return value === null || !Number.isFinite(value) ? "ไม่มีข้อมูล" : value.toFixed(2);
}

export default function DecisionSupportPage() {
  const [mode, setMode] = useState<DecisionMode>("flood");
  const [year, setYear] = useState(2024);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDistrict, setActiveDistrict] = useState("ทั้งหมด");

  useEffect(() => {
    setLoading(true);
    setError(null);
    setActiveDistrict("ทั้งหมด");
    fetch(`/api/decision-support?mode=${mode}&year=${year}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "โหลดข้อมูลไม่สำเร็จ");
        return body;
      })
      .then(setData)
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [mode, year]);

  const rows = useMemo(() => {
    const allRows = data?.rows ?? [];
    return activeDistrict === "ทั้งหมด"
      ? allRows
      : allRows.filter((row: any) => row.district_name === activeDistrict);
  }, [activeDistrict, data?.rows]);
  const selected = activeDistrict === "ทั้งหมด"
    ? data?.rows?.[0]
    : data?.rows?.find((row: any) => row.district_name === activeDistrict);

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950/95 px-4 py-3">
        <Link href="/" className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-base font-black">วิเคราะห์เพื่อจัดลำดับการดำเนินงาน</h1>
          <p className="text-[10px] text-slate-500">Decision Support · คะแนนคัดกรอง ไม่ใช่คำสั่งอัตโนมัติ</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-1">
            <button
              onClick={() => setMode("flood")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold ${mode === "flood" ? "bg-sky-500 text-white" : "text-slate-500"}`}
            >
              <Droplets className="h-3.5 w-3.5" /> น้ำท่วม
            </button>
            <button
              onClick={() => setMode("heat")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold ${mode === "heat" ? "bg-orange-500 text-white" : "text-slate-500"}`}
            >
              <Flame className="h-3.5 w-3.5" /> ความร้อน
            </button>
          </div>
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs"
          >
            {YEARS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-80 shrink-0 overflow-y-auto border-r border-slate-800 bg-slate-900/60 p-4 md:block">
          <div className={`rounded-xl border p-4 ${mode === "flood" ? "border-sky-500/20 bg-sky-500/5" : "border-orange-500/20 bg-orange-500/5"}`}>
            <div className="flex items-center gap-2">
              {mode === "flood" ? <Droplets className="h-5 w-5 text-sky-400" /> : <Flame className="h-5 w-5 text-orange-400" />}
              <h2 className="text-sm font-black">{data?.title ?? "กำลังโหลด"}</h2>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-400">{data?.methodology}</p>
            <p className="mt-2 text-[10px] font-bold text-slate-300">ช่วงข้อมูล: {data?.period ?? `ปี ${year}`}</p>
          </div>

          <label className="mt-4 block text-[9px] font-bold uppercase tracking-widest text-slate-500">เลือกเขต</label>
          <select
            value={activeDistrict}
            onChange={(event) => setActiveDistrict(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs"
          >
            <option value="ทั้งหมด">กรุงเทพมหานคร (ทั้งหมด)</option>
            {(data?.rows ?? []).map((row: any) => (
              <option key={row.district_name}>{row.district_name}</option>
            ))}
          </select>

          {selected && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-[9px] text-slate-500">คะแนนสูงสุด/ที่เลือก</div>
                  <div className="mt-1 text-2xl font-black">{selected.score ?? "–"}<span className="text-xs text-slate-600">/100</span></div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-[9px] text-slate-500">ความเชื่อมั่น</div>
                  <div className="mt-1 text-sm font-black">{selected.confidence}</div>
                  <div className="text-[10px] text-slate-500">ข้อมูล {selected.coverage}%</div>
                </div>
              </div>
              <div>
                <h3 className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                  <Gauge className="h-3 w-3" /> องค์ประกอบคะแนน
                </h3>
                <div className="mt-2 space-y-2">
                  {selected.components?.map((component: any) => (
                    <div key={component.key} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                      <div className="flex justify-between gap-2 text-[10px]">
                        <span className="text-slate-300">{component.label}</span>
                        <span className="font-mono text-slate-200">{component.normalized === null ? "ไม่มีข้อมูล" : `${component.normalized.toFixed(1)}/100`}</span>
                      </div>
                      <div className="mt-1 flex justify-between text-[9px] text-slate-600">
                        <span>{component.source}</span>
                        <span>น้ำหนัก {component.weight}% · ค่าดิบ {formatValue(component.value)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <h3 className="flex items-center gap-1.5 text-[10px] font-bold text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" /> ข้อจำกัดก่อนนำไปใช้
            </h3>
            <ul className="mt-2 space-y-1.5 text-[9px] leading-relaxed text-slate-400">
              {(data?.limitations ?? []).map((item: string) => <li key={item}>• {item}</li>)}
            </ul>
          </div>
        </aside>

        <main className="relative min-w-0 flex-1">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> กำลังรวมข้อมูลหลายแหล่ง
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-300">{error}</div>
          ) : (
            <DecisionSupportMap data={data?.geojson} activeDistrict={activeDistrict} onDistrictSelect={setActiveDistrict} />
          )}
          <div className="absolute bottom-4 right-4 z-[1000] rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-[9px] shadow-xl">
            <div className="mb-2 flex items-center gap-1.5 font-bold text-slate-300"><MapPin className="h-3 w-3" /> ระดับคะแนน</div>
            {[
              ["#b91c1c", "80-100 สูงมาก"],
              ["#f97316", "60-79 สูง"],
              ["#eab308", "40-59 ปานกลาง"],
              ["#16a34a", "0-39 ต่ำ"],
              ["#475569", "ไม่มีข้อมูล"],
            ].map(([color, label]) => (
              <div key={label} className="flex items-center gap-2 py-0.5 text-slate-400">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} /> {label}
              </div>
            ))}
          </div>
        </main>

        <aside className="hidden w-[390px] shrink-0 overflow-y-auto border-l border-slate-800 bg-slate-950 p-4 xl:block">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-black">อันดับเขตที่ควรตรวจสอบก่อน</h2>
            <span className="flex items-center gap-1 text-[9px] text-slate-600"><Database className="h-3 w-3" /> {rows.length} เขต</span>
          </div>
          <div className="space-y-1.5">
            {rows.map((row: any, index: number) => (
              <button
                key={row.district_name}
                onClick={() => setActiveDistrict(row.district_name)}
                className="w-full rounded-lg border border-slate-800 bg-slate-900/50 p-2.5 text-left hover:border-slate-600"
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 text-right font-mono text-[10px] text-slate-600">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] font-bold">{row.district_name}</span>
                  <span className="font-mono text-sm font-black">{row.score ?? "–"}</span>
                </div>
                <div className="mt-1 ml-7 flex justify-between text-[9px] text-slate-500">
                  <span>{row.level}</span>
                  <span>เชื่อมั่น {row.confidence} · {row.coverage}%</span>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

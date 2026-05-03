/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Leaf, Target } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  calculatePriorityScore,
  formatPercent,
  formatRai,
  getNdviClass,
  getNdviClassThai,
  getNdviRecommendation,
  normalizeNdviScore,
  resolveNdviMean,
} from "@/lib/ndvi";
import type { DistrictStatistic } from "@/types/district";

export default function DistrictDetailPage() {
  const params = useParams<{ id: string }>();
  const [rows, setRows] = useState<DistrictStatistic[]>([]);
  const [rankInfo, setRankInfo] = useState<{ ndviRank?: number; priorityRank?: number; total?: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/statistics?district_id=${params.id}`)
      .then((res) => res.json())
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [params.id]);

  const latest = useMemo(() => [...rows].sort((a, b) => b.year - a.year)[0], [rows]);
  const ndviMean = resolveNdviMean(latest);
  const ndviScore = latest?.ndvi_score ?? normalizeNdviScore(ndviMean);
  const ndviClass = latest?.ndvi_class || getNdviClass(ndviMean);
  const trend = rows.map((row) => ({ year: row.year, ndvi: resolveNdviMean(row) ?? 0 }));
  const recommendations = latest ? getNdviRecommendation(latest) : [];
  const priorityScore = latest ? calculatePriorityScore(latest) : null;

  useEffect(() => {
    if (!latest?.year) return;
    fetch(`/api/lst?year=${latest.year}&metric=vegetation`)
      .then((res) => res.json())
      .then((data) => {
        const features = data?.geojson?.features || [];
        const ndviRanked = [...features].sort((a: any, b: any) => (b.properties?.ndvi_mean ?? -1) - (a.properties?.ndvi_mean ?? -1));
        const priorityRanked = [...features].sort((a: any, b: any) => (b.properties?.priority_score ?? -1) - (a.properties?.priority_score ?? -1));
        const districtId = Number(params.id);
        setRankInfo({
          ndviRank: ndviRanked.findIndex((feature: any) => feature.properties?.id === districtId) + 1,
          priorityRank: priorityRanked.findIndex((feature: any) => feature.properties?.id === districtId) + 1,
          total: features.length,
        });
      })
      .catch(() => setRankInfo(null));
  }, [latest?.year, params.id]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-6xl">
        <Link href="/green-space" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-100 mb-6">
          <ArrowLeft className="w-4 h-4" /> กลับไปหน้าแผนที่พื้นที่สีเขียว
        </Link>

        <div className="flex flex-col gap-2 mb-6">
          <p className="text-xs text-emerald-300 font-bold tracking-widest uppercase">District NDVI Detail</p>
          <h1 className="text-3xl font-black">{latest?.district_name || latest?.name_th || `เขต ${params.id}`}</h1>
          <p className="text-slate-400">ข้อมูลล่าสุดปี {latest?.year || "ไม่มีข้อมูล"} สำหรับการวิเคราะห์พื้นที่สีเขียวรายเขต</p>
        </div>

        {loading ? (
          <div className="text-slate-400">กำลังโหลดข้อมูล...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <section className="lg:col-span-2 bg-slate-900/70 border border-slate-800 rounded-lg p-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {[
                  ["NDVI ล่าสุด", ndviMean !== null ? ndviMean.toFixed(3) : "ไม่มีข้อมูล"],
                  ["คะแนน NDVI", ndviScore !== null && ndviScore !== undefined ? ndviScore.toFixed(2) : "ไม่มีข้อมูล"],
                  ["ระดับ", getNdviClassThai(ndviClass)],
                  ["Priority Score", priorityScore !== null ? priorityScore.toFixed(1) : "ไม่มีข้อมูล"],
                  ["อันดับ NDVI", rankInfo?.ndviRank ? `${rankInfo.ndviRank}/${rankInfo.total}` : "ไม่มีข้อมูล"],
                  ["อันดับเร่งด่วน", rankInfo?.priorityRank ? `${rankInfo.priorityRank}/${rankInfo.total}` : "ไม่มีข้อมูล"],
                  ["พื้นที่สีเขียว", formatPercent(latest?.green_area_ratio)],
                  ["พื้นที่สีเขียวประมาณ", formatRai(latest?.green_area_rai)],
                  ["พื้นที่เขียวน้อย", formatPercent(latest?.low_green_ratio)],
                  ["พื้นที่น้ำ", formatPercent(latest?.water_ratio)],
                ].map(([label, value]) => (
                  <div key={label} className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 min-w-0">
                    <div className="text-[10px] text-slate-500 font-bold">{label}</div>
                    <div className="text-lg font-black mt-1 truncate">{value}</div>
                  </div>
                ))}
              </div>

              <div className="h-72">
                <div className="flex items-center gap-2 mb-3">
                  <Leaf className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-bold">แนวโน้ม NDVI รายปี</h2>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <XAxis dataKey="year" stroke="#64748b" />
                    <YAxis stroke="#64748b" domain={["dataMin - 0.02", "dataMax + 0.02"]} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", color: "#f8fafc" }} />
                    <Line type="monotone" dataKey="ndvi" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <aside className="bg-slate-900/70 border border-slate-800 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-amber-300" />
                <h2 className="text-sm font-bold">คำแนะนำเชิงนโยบาย</h2>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed mb-4">
                เขตนี้มี NDVI {ndviMean !== null && ndviMean < 0.35 ? "ต่ำกว่าระดับที่ควรเฝ้าระวัง" : "อยู่ในระดับที่ควรติดตามต่อเนื่อง"} และควรพิจารณาร่วมกับข้อมูลภาคสนามก่อนตัดสินใจลงทุน
              </p>
              <div className="space-y-3">
                {recommendations.map((item) => (
                  <div key={item} className="text-sm text-slate-300 bg-slate-950/60 border border-slate-800 rounded-lg p-3 leading-relaxed">
                    {item}
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-500 leading-relaxed">
                ค่า population/density ที่มาจาก pipeline เดิมเป็น proxy จากแสงกลางคืน ไม่ใช่ข้อมูลประชากรจริง
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { ArrowRight, MapPin, Route, Users } from "lucide-react";

type BridgeMode = "population-to-accessibility" | "accessibility-to-population";

type Stat = {
  label: string;
  value: string;
};

type PopulationAccessBridgeProps = {
  mode: BridgeMode;
  href: string;
  districtName?: string | null;
  population?: number | null;
  density?: number | null;
  exposureScore?: number | null;
  accessibilityScore?: number | null;
  completeCoveragePct?: number | null;
  underservedPopulation?: number | null;
  servicesPer10000?: number | null;
  className?: string;
};

function formatCount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return Math.round(value).toLocaleString("th-TH");
}

function formatScore(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return value.toLocaleString("th-TH", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export default function PopulationAccessBridge({
  mode,
  href,
  districtName,
  population,
  density,
  exposureScore,
  accessibilityScore,
  completeCoveragePct,
  underservedPopulation,
  servicesPer10000,
  className = "",
}: PopulationAccessBridgeProps) {
  const isPopulationMode = mode === "population-to-accessibility";
  const title = isPopulationMode
    ? "ดูบริการเมืองต่อจากประชากร"
    : "อ่านคะแนนบริการคู่กับประชากร";
  const Icon = isPopulationMode ? Route : Users;
  const districtLabel = districtName ? `เขต${districtName}` : "พื้นที่ที่เลือก";
  const body = isPopulationMode
    ? `${districtLabel} มีสัญญาณความต้องการบริการจากจำนวนคน ความหนาแน่น และการเติบโต ควรตรวจร่วมกับหน้าเข้าถึงบริการเพื่อดูว่าบริการพื้นฐานอยู่ใกล้ประชากรเพียงใด`
    : `${districtLabel} แสดงความใกล้บริการแบบ proximity screening ควรอ่านคู่กับจำนวนประชากร ความหนาแน่น และแรงกดดันประชากรก่อนจัดลำดับตรวจพื้นที่`;
  const cta = isPopulationMode ? "เปิดหน้าการเข้าถึง" : "เปิดหน้าประชากร";
  const stats: Stat[] = isPopulationMode
    ? [
        { label: "ประชากร", value: `${formatCount(population)} คน` },
        { label: "ความหนาแน่น", value: `${formatCount(density)} คน/ตร.กม.` },
        { label: "แรงกดดัน", value: `${formatScore(exposureScore)}/100` },
      ]
    : [
        { label: "ประชากรอ้างอิง", value: `${formatCount(population)} คน` },
        { label: "เข้าไม่ครบ 5 หมวด", value: `${formatCount(underservedPopulation)} คน` },
        {
          label: "บริการ/10,000 คน",
          value: formatScore(servicesPer10000, 2),
        },
      ];

  return (
    <section
      data-testid="population-access-bridge"
      className={`rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 ${className}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-[11px] font-black text-cyan-100">{title}</h3>
          <p className="mt-1 text-[10px] leading-5 text-slate-400">{body}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/55 px-2 py-2">
            <div className="truncate text-[8px] text-slate-500">{stat.label}</div>
            <div className="mt-0.5 truncate text-[10px] font-black text-slate-100">{stat.value}</div>
          </div>
        ))}
      </div>

      {!isPopulationMode && accessibilityScore != null && completeCoveragePct != null && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
          <MapPin className="h-3 w-3 text-emerald-300" />
          <span>
            คะแนนเฉลี่ย {formatScore(accessibilityScore)}% · ครบ 5 หมวด {formatScore(completeCoveragePct)}%
          </span>
        </div>
      )}

      <Link
        href={href}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-[10px] font-black text-cyan-100 hover:border-cyan-300 hover:bg-cyan-400/15"
      >
        {cta}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}

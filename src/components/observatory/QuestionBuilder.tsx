"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, CalendarRange, MapPin, ScanSearch } from "lucide-react";
import { FormEvent, useState } from "react";
import {
  getObservatoryLens,
  OBSERVATORY_LENSES,
  type ObservatoryLensId,
} from "@/lib/observatory/catalog";
import {
  clampLensBaseline,
  clampLensYear,
  getLensYears,
} from "@/lib/observatory/lens-data";

type QuestionBuilderProps = {
  areas: string[];
  compact?: boolean;
  initialLens?: ObservatoryLensId;
  initialArea?: string;
  initialYear?: number;
  initialBaseline?: number;
};

export default function QuestionBuilder({
  areas,
  compact = false,
  initialLens = "heat",
  initialArea = "bangkok",
  initialYear = 2024,
  initialBaseline = 2018,
}: QuestionBuilderProps) {
  const router = useRouter();
  const [lens, setLens] = useState<ObservatoryLensId>(initialLens);
  const [area, setArea] = useState(initialArea);
  const [year, setYear] = useState(initialYear);
  const [baseline, setBaseline] = useState(initialBaseline);
  const lensConfig = getObservatoryLens(lens);
  const years = getLensYears(lensConfig);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams({
      lens,
      area,
      year: String(year),
      baseline: String(baseline),
    });
    router.push(`/observatory?${params.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className={`border border-[var(--oe-line)] bg-[var(--oe-surface)] ${
        compact ? "rounded-[var(--radius-panel)] p-3" : "rounded-[var(--radius-panel)] p-4 sm:p-5"
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold">กำหนดคำถามวิเคราะห์</h2>
          {!compact && (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--oe-muted)]">
              เลือกประเด็น พื้นที่ และช่วงเปรียบเทียบ ระบบจะแสดงสถานะข้อมูลก่อนแสดงผลวิเคราะห์
            </p>
          )}
        </div>
        <ScanSearch aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--oe-primary)]" />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.5fr)_minmax(180px,1fr)_160px_160px_auto]">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[var(--oe-muted)]">ต้องการตรวจอะไร</span>
          <select
            value={lens}
            onChange={(event) => {
              const nextLens = event.target.value as ObservatoryLensId;
              const nextLensConfig = getObservatoryLens(nextLens);
              const nextYear = clampLensYear(nextLensConfig, year);
              setLens(nextLens);
              setYear(nextYear);
              setBaseline(clampLensBaseline(nextLensConfig, nextYear, baseline));
            }}
            className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--oe-line-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--oe-primary)] focus:ring-2 focus:ring-[var(--oe-primary-soft)]"
          >
            {OBSERVATORY_LENSES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.shortTitle}{item.phase === "phase-2" ? " · ระยะถัดไป" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--oe-muted)]">
            <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
            พื้นที่
          </span>
          <select
            value={area}
            onChange={(event) => setArea(event.target.value)}
            className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--oe-line-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--oe-primary)] focus:ring-2 focus:ring-[var(--oe-primary-soft)]"
          >
            <option value="bangkok">กรุงเทพมหานคร</option>
            {areas.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--oe-muted)]">
            <CalendarRange aria-hidden="true" className="h-3.5 w-3.5" />
            ปีที่ตรวจ
          </span>
          <select
            value={year}
            onChange={(event) => {
              const nextYear = Number(event.target.value);
              setYear(nextYear);
              setBaseline(clampLensBaseline(lensConfig, nextYear, baseline));
            }}
            className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--oe-line-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--oe-primary)] focus:ring-2 focus:ring-[var(--oe-primary-soft)]"
          >
            {years.filter((item) => item > lensConfig.minYear).map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[var(--oe-muted)]">เทียบกับปีฐาน</span>
          <select
            value={baseline}
            onChange={(event) => setBaseline(Number(event.target.value))}
            className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--oe-line-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--oe-primary)] focus:ring-2 focus:ring-[var(--oe-primary-soft)]"
          >
            {years.filter((item) => item < year).map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>

        <button
          type="submit"
          className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--oe-primary)] px-4 text-sm font-bold text-white outline-none transition-colors duration-150 hover:bg-[var(--oe-primary-hover)] focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)] focus-visible:ring-offset-2"
        >
          เปิดพื้นที่วิเคราะห์
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

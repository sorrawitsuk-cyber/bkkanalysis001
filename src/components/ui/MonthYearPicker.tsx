"use client";

import { Calendar } from "lucide-react";

const MONTHS_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const ACCENT_MAP = {
  sky:     { active: "bg-sky-500 text-white shadow-lg shadow-sky-500/20",     avail: "border-sky-800/50 text-sky-300 bg-sky-950/30 hover:opacity-80",    btn: "bg-sky-500/20 text-sky-400 border-sky-500/50",     label: "text-sky-400",  slider: "accent-sky-400" },
  cyan:    { active: "bg-cyan-500 text-white shadow-lg shadow-cyan-500/20",   avail: "border-cyan-800/50 text-cyan-300 bg-cyan-950/30 hover:opacity-80",  btn: "bg-cyan-500/20 text-cyan-400 border-cyan-500/50",  label: "text-cyan-400", slider: "accent-cyan-400" },
  yellow:  { active: "bg-yellow-500 text-white shadow-lg shadow-yellow-500/20", avail: "border-yellow-800/50 text-yellow-300 bg-yellow-950/30 hover:opacity-80", btn: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50", label: "text-yellow-400", slider: "accent-yellow-400" },
  red:     { active: "bg-red-500 text-white shadow-lg shadow-red-500/20",     avail: "border-red-800/50 text-red-300 bg-red-950/30 hover:opacity-80",    btn: "bg-red-500/20 text-red-400 border-red-500/50",     label: "text-red-400",  slider: "accent-red-400" },
  emerald: { active: "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20", avail: "border-emerald-800/50 text-emerald-300 bg-emerald-950/30 hover:opacity-80", btn: "bg-emerald-500/20 text-emerald-400 border-emerald-500/50", label: "text-emerald-400", slider: "accent-emerald-400" },
  indigo:  { active: "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20", avail: "border-indigo-800/50 text-indigo-300 bg-indigo-950/30 hover:opacity-80", btn: "bg-indigo-500/20 text-indigo-400 border-indigo-500/50", label: "text-indigo-400", slider: "accent-indigo-400" },
  orange:  { active: "bg-orange-500 text-white shadow-lg shadow-orange-500/20", avail: "border-orange-800/50 text-orange-300 bg-orange-950/30 hover:opacity-80", btn: "bg-orange-500/20 text-orange-400 border-orange-500/50", label: "text-orange-400", slider: "accent-orange-400" },
} as const;

export type AccentColor = keyof typeof ACCENT_MAP;

export interface MonthYearPickerProps {
  year: number;
  month: number | null;
  minYear: number;
  maxYear: number;
  /** "YYYY-MM" strings from cache index — leave empty to hide month grid */
  availableMonths?: string[];
  onYearChange: (y: number) => void;
  onMonthChange: (m: number | null) => void;
  accentColor?: AccentColor;
  compareMode?: boolean;
  compareYear?: number;
  onCompareModeChange?: (v: boolean) => void;
  onCompareYearChange?: (y: number) => void;
}

export default function MonthYearPicker({
  year, month, minYear, maxYear,
  availableMonths = [],
  onYearChange, onMonthChange,
  accentColor = "sky",
  compareMode, compareYear,
  onCompareModeChange, onCompareYearChange,
}: MonthYearPickerProps) {
  const c = ACCENT_MAP[accentColor];
  const showMonths = availableMonths.length > 0;

  const availableForYear = new Set(
    availableMonths
      .filter((s) => s.startsWith(`${year}-`))
      .map((s) => parseInt(s.split("-")[1], 10)),
  );

  return (
    <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-5 border border-slate-800 shadow-2xl w-full">
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5" /> เลือกช่วงเวลา
        </h4>
        {onCompareModeChange && (
          <button
            onClick={() => onCompareModeChange(!compareMode)}
            className={`text-[9px] px-3 py-1.5 rounded-lg transition-all border font-bold ${
              compareMode ? c.btn : "bg-transparent text-slate-500 border-slate-700 hover:border-slate-500"
            }`}
          >
            เปรียบเทียบปี
          </button>
        )}
      </div>

      {/* Year slider */}
      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">ปี (Year)</p>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-400 font-mono">{minYear}</span>
        <span className={`text-lg font-bold font-mono ${c.label}`}>{year}</span>
        <span className="text-xs text-slate-400 font-mono">{maxYear}</span>
      </div>
      <input
        type="range"
        min={minYear}
        max={maxYear}
        value={year}
        onChange={(e) => {
          onYearChange(parseInt(e.target.value, 10));
          if (month !== null) onMonthChange(null);
        }}
        className={`w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer ${c.slider} mb-3`}
      />

      {/* Month grid — only shown when cache months are available */}
      {showMonths && (
        <>
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1.5">เดือน (Month)</p>
          <div className="grid grid-cols-4 gap-1 mb-1">
            <button
              onClick={() => onMonthChange(null)}
              className={`col-span-4 text-[9px] py-1.5 rounded-lg border transition-all font-bold ${
                month === null
                  ? c.active
                  : "bg-slate-800/40 border-slate-700/50 text-slate-400 hover:text-slate-200"
              }`}
            >
              ทั้งปี (Annual)
            </button>
            {MONTHS_TH.map((label, i) => {
              const m = i + 1;
              const isAvail = availableForYear.has(m);
              const isSelected = month === m;
              return (
                <button
                  key={m}
                  disabled={!isAvail}
                  onClick={() => onMonthChange(m)}
                  title={isAvail ? `${label} ${year}` : "ยังไม่มีข้อมูลเดือนนี้"}
                  className={`text-[9px] py-1.5 rounded-lg border transition-all font-bold ${
                    isSelected
                      ? c.active
                      : isAvail
                      ? c.avail
                      : "bg-slate-800/20 border-slate-800 text-slate-700 cursor-not-allowed"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {availableForYear.size === 0 && (
            <p className="text-[9px] text-slate-600 mt-1 leading-snug">
              ยังไม่มีข้อมูลรายเดือนสำหรับปี {year}
            </p>
          )}
        </>
      )}

      {/* Compare mode — baseline year */}
      {compareMode && onCompareYearChange && compareYear !== undefined && (
        <div className="mt-4 pt-4 border-t border-slate-800/50">
          <div className="flex justify-between items-center mb-2">
            <h4 className={`text-[10px] font-bold ${c.label} uppercase tracking-widest`}>ปีฐาน (Baseline)</h4>
            <span className={`text-sm font-bold font-mono ${c.label}`}>{compareYear}</span>
          </div>
          <input
            type="range"
            min={minYear}
            max={year - 1}
            value={Math.min(compareYear, year - 1)}
            onChange={(e) => onCompareYearChange(parseInt(e.target.value, 10))}
            className={`w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer ${c.slider}`}
          />
        </div>
      )}
    </div>
  );
}

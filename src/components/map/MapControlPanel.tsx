"use client";

import { ReactNode } from "react";
import { Info, Layers, MousePointer2 } from "lucide-react";

export type AccentTheme = "orange" | "emerald" | "indigo" | "cyan" | "sky" | "yellow";

export interface MapModeOption {
  value: string;
  label: string;
  description?: string;
}

interface Theme {
  activeBtn: string;
  activeBaseMap: string;
  opacityLabel: string;
  opacityAccent: string;
}

const THEMES: Record<AccentTheme, Theme> = {
  orange: {
    activeBtn:     "bg-orange-500 text-white shadow-lg shadow-orange-500/20",
    activeBaseMap: "bg-orange-500 border-orange-500 text-white shadow-md shadow-orange-500/20",
    opacityLabel:  "text-orange-500 bg-orange-500/10",
    opacityAccent: "accent-orange-500",
  },
  emerald: {
    activeBtn:     "bg-emerald-500 text-white",
    activeBaseMap: "bg-emerald-500 border-emerald-500 text-white",
    opacityLabel:  "text-emerald-400 bg-emerald-500/10",
    opacityAccent: "accent-emerald-500",
  },
  indigo: {
    activeBtn:     "bg-indigo-500 text-white",
    activeBaseMap: "bg-indigo-500 border-indigo-500 text-white",
    opacityLabel:  "text-indigo-400 bg-indigo-500/10",
    opacityAccent: "accent-indigo-500",
  },
  cyan: {
    activeBtn:     "bg-cyan-500 text-white",
    activeBaseMap: "bg-cyan-500 border-cyan-500 text-white",
    opacityLabel:  "text-cyan-400 bg-cyan-500/10",
    opacityAccent: "accent-cyan-400",
  },
  sky: {
    activeBtn:     "bg-sky-500 text-white shadow-lg shadow-sky-500/20",
    activeBaseMap: "bg-sky-500 border-sky-500 text-white shadow-md shadow-sky-500/20",
    opacityLabel:  "text-sky-400 bg-sky-500/10",
    opacityAccent: "accent-sky-400",
  },
  yellow: {
    activeBtn:     "bg-yellow-400 text-slate-950 shadow-lg shadow-yellow-400/20",
    activeBaseMap: "bg-yellow-400 border-yellow-400 text-slate-950 shadow-md shadow-yellow-400/20",
    opacityLabel:  "text-yellow-200 bg-yellow-300/10",
    opacityAccent: "accent-yellow-300",
  },
};

const BASE_MAPS = ["dark", "light", "satellite", "streets", "none"] as const;
type BaseMapId = typeof BASE_MAPS[number];
const BASE_MAP_LABELS: Record<BaseMapId, string> = {
  dark: "มืด",
  light: "สว่าง",
  satellite: "ภาพถ่าย",
  streets: "ถนน",
  none: "ไม่ใช้",
};

interface MapControlPanelProps {
  accent: AccentTheme;
  granularity: "district" | "subdistrict";
  onGranularityChange: (g: "district" | "subdistrict") => void;
  mapMode: string;
  mapModes: MapModeOption[];
  onMapModeChange: (m: string) => void;
  showOpacity: boolean;
  opacity: number;
  onOpacityChange: (o: number) => void;
  baseMap: string;
  onBaseMapChange: (m: BaseMapId) => void;
  onReset: () => void;
  /** Extra controls rendered inside the main card, below the mapMode toggle. */
  extraControls?: ReactNode;
  currentLayer?: string;
  currentPeriod?: string;
  dataSource?: string;
  interactionHint?: string;
  granularityNote?: string;
  showGranularity?: boolean;
}

export default function MapControlPanel({
  accent,
  granularity,
  onGranularityChange,
  mapMode,
  mapModes,
  onMapModeChange,
  showOpacity,
  opacity,
  onOpacityChange,
  baseMap,
  onBaseMapChange,
  onReset,
  extraControls,
  currentLayer,
  currentPeriod,
  dataSource,
  interactionHint,
  granularityNote,
  showGranularity = true,
}: MapControlPanelProps) {
  const theme = THEMES[accent];
  const inactive = "text-slate-500 hover:text-slate-300";
  const activeMode = mapModes.find((mode) => mode.value === mapMode);
  const isRasterMode = mapMode !== "district";

  return (
    <>
      {/* Main control card */}
      <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-full">
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
            <Layers className="w-3.5 h-3.5" /> แผงควบคุมหลัก
          </h4>
          <button
            onClick={onReset}
            className="text-[9px] px-2.5 py-1 bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 transition-all font-bold"
          >
            คืนค่าเริ่มต้น
          </button>
        </div>

        {(currentLayer || currentPeriod || dataSource) && (
          <div className="mb-4 rounded-lg border border-slate-700/60 bg-slate-950/60 p-3">
            <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-slate-500">กำลังแสดง</p>
            {currentLayer && <p className="text-[11px] font-bold text-slate-200">{currentLayer}</p>}
            {currentPeriod && <p className="mt-1 text-[9px] text-slate-500">ช่วงข้อมูล: {currentPeriod}</p>}
            {dataSource && <p className="text-[9px] text-slate-500">แหล่งข้อมูล: {dataSource}</p>}
          </div>
        )}

        {showGranularity && (
          <>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">ขอบเขตอ้างอิง</p>
            <div className="grid grid-cols-2 bg-slate-900/80 rounded-xl p-1 mb-3 border border-slate-800">
              {(["district", "subdistrict"] as const).map((g) => {
                const isActive = granularity === g;
                return (
                  <button
                    key={g}
                    onClick={() => onGranularityChange(g)}
                    className={`text-[10px] py-2 rounded-lg transition-all font-bold ${isActive ? theme.activeBtn : inactive}`}
                  >
                    {g === "district" ? "เขต (50)" : "แขวง (180)"}
                  </button>
                );
              })}
            </div>
            <p className="mb-3 text-[9px] leading-snug text-slate-600">
              {granularityNote ?? (granularity === "district"
                ? "สรุปและเลือกพื้นที่ตาม 50 เขต"
                : "แสดงขอบเขต 180 แขวง โดยค่ารายแขวงอาจอ้างอิงจากเขตแม่")}
            </p>
          </>
        )}

        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">วิธีแสดงผล</p>
        <div className={`grid bg-slate-900/80 rounded-xl p-1 mb-3 border border-slate-800`} style={{ gridTemplateColumns: `repeat(${mapModes.length}, 1fr)` }}>
          {mapModes.map((mode) => (
            <button
              key={mode.value}
              onClick={() => onMapModeChange(mode.value)}
              className={`text-[10px] py-2 rounded-lg transition-all font-bold ${mapMode === mode.value ? theme.activeBtn : inactive}`}
            >
              {mode.label}
            </button>
          ))}
        </div>
        {(activeMode?.description || isRasterMode) && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-2.5">
            <Info className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
            <p className="text-[9px] leading-snug text-slate-500">
              {activeMode?.description}
              {isRasterMode && ` ขอบเขต${granularity === "district" ? "เขต" : "แขวง"}ใช้สำหรับอ้างอิงและเลือกพื้นที่เท่านั้น`}
            </p>
          </div>
        )}

        {interactionHint && (
          <div className="mb-3 flex items-start gap-2 text-[9px] leading-snug text-slate-500">
            <MousePointer2 className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{interactionHint}</span>
          </div>
        )}

        {extraControls}
      </div>

      {/* Opacity card */}
      {showOpacity && (
        <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-full">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ความทึบของชั้นข้อมูล</h4>
            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${theme.opacityLabel}`}>
              {Math.round(opacity * 100)}%
            </span>
          </div>
          <input
            type="range" min="0" max="1" step="0.01"
            value={opacity}
            onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
            className={`w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer ${theme.opacityAccent}`}
          />
        </div>
      )}

      {/* Base map card */}
      <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-full">
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Layers className="w-3.5 h-3.5" /> แผนที่ฐาน
        </h4>
        <div className="grid grid-cols-3 gap-2">
          {BASE_MAPS.map((m) => (
            <button
              key={m}
              onClick={() => onBaseMapChange(m)}
              className={`text-[9px] py-2 rounded-lg border transition-all font-bold ${
                baseMap === m
                  ? theme.activeBaseMap
                  : "bg-slate-800/50 border-slate-700/50 text-slate-500 hover:border-slate-500 hover:text-slate-300"
              }`}
            >
              {BASE_MAP_LABELS[m]}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

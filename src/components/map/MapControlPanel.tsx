"use client";

import { ReactNode } from "react";
import { Layers } from "lucide-react";

export type AccentTheme = "orange" | "emerald" | "indigo" | "cyan" | "sky" | "yellow";

export interface MapModeOption {
  value: string;
  label: string;
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

interface MapControlPanelProps {
  accent: AccentTheme;
  granularity: "district" | "subdistrict";
  onGranularityChange: (g: "district" | "subdistrict") => void;
  /** When true, granularity buttons are highlighted regardless of mapMode. Default: only when mapMode === "district". */
  granularityAlwaysActive?: boolean;
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
}

export default function MapControlPanel({
  accent,
  granularity,
  onGranularityChange,
  granularityAlwaysActive = false,
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
}: MapControlPanelProps) {
  const theme = THEMES[accent];
  const inactive = "text-slate-500 hover:text-slate-300";

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
            RESET
          </button>
        </div>

        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">ขอบเขต</p>
        <div className="grid grid-cols-2 bg-slate-900/80 rounded-xl p-1 mb-3 border border-slate-800">
          {(["district", "subdistrict"] as const).map((g) => {
            const isActive = granularity === g && (granularityAlwaysActive || mapMode === "district");
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

        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">รูปแบบ</p>
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

        {extraControls}
      </div>

      {/* Opacity card */}
      {showOpacity && (
        <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-full">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ความโปร่งใส</h4>
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
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

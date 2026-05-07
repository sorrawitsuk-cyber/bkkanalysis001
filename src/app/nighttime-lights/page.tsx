/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import NightLightsSidebar from "@/components/gee/NightLightsSidebar";
import { Calendar, FileDown, Layers, Moon, RefreshCw } from "lucide-react";

const LSTMapView = dynamic(() => import("@/components/gee/LSTMapView"), { ssr: false });

type MapMode = "district" | "idw";
const FIRST_YEAR = 2014;
const LATEST_DATA_YEAR = 2024;

function formatRadiance(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ไม่มีข้อมูล";
  return value.toLocaleString("th-TH", { maximumFractionDigits: digits });
}

export default function NighttimeLightsPage() {
  const [activeDistrict, setActiveDistrict] = useState("ทั้งหมด");
  const [selectedYear, setSelectedYear] = useState(2024);
  const [compareMode, setCompareMode] = useState(false);
  const [compareYear, setCompareYear] = useState(2014);
  const [mapMode, setMapMode] = useState<MapMode>("idw");
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [invertedMask, setInvertedMask] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [opacity, setOpacity] = useState(0.82);
  const [baseMap, setBaseMap] = useState<"dark" | "light" | "satellite" | "streets" | "none">("dark");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ year: selectedYear.toString() });
    if (activeDistrict !== "ทั้งหมด") params.append("district", activeDistrict);
    if (compareMode) params.append("compareYear", compareYear.toString());

    fetch(`/api/nighttime-lights?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setGeojsonData(data.geojson);
        setInvertedMask(data.invertedMask);
        setSummary(data.summary);
        setLoading(false);
      })
      .catch((error) => {
        console.error(error);
        setLoading(false);
      });
  }, [activeDistrict, selectedYear, compareMode, compareYear]);

  const handleReset = () => {
    setActiveDistrict("ทั้งหมด");
    setSelectedYear(2024);
    setCompareMode(false);
    setCompareYear(2014);
    setMapMode("idw");
    setOpacity(0.82);
    setBaseMap("dark");
  };

  const handleExportPlaceholder = async () => {
    setIsExporting(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    setIsExporting(false);
    alert("Nighttime Lights report export จะต่อกับ A4 report template ในรอบถัดไป");
  };

  const periodLabel = `Annual composite ${selectedYear}`;

  const kpiCards = [
    {
      label: compareMode ? "ส่วนต่างแสงเฉลี่ย" : "ค่าแสงกลางคืนเฉลี่ย",
      value: compareMode ? `${(summary?.avgDelta ?? 0) > 0 ? "+" : ""}${formatRadiance(summary?.avgDelta, 3)}` : formatRadiance(summary?.averageRadiance, 3),
    },
    {
      label: compareMode ? "เขตเพิ่มขึ้นสูงสุด" : "เขตสว่างที่สุด",
      value: compareMode ? summary?.fastestGrowthDistrict || "ไม่มีข้อมูล" : summary?.maxDistrict || "ไม่มีข้อมูล",
    },
    {
      label: compareMode ? "ส่วนต่างสูงสุด" : "ค่าสูงสุดรายเขต",
      value: compareMode ? `${(summary?.maxDelta ?? 0) > 0 ? "+" : ""}${formatRadiance(summary?.maxDelta, 3)}` : formatRadiance(summary?.maxRadiance, 3),
    },
    {
      label: "ช่วงข้อมูลดาวเทียม",
      value: compareMode ? `${selectedYear} vs ${compareYear}` : periodLabel,
    },
  ];

  const legendConfig = compareMode
    ? {
        title: "การเปลี่ยนแปลงแสงกลางคืน",
        description: `ค่า avg_rad ปี ${selectedYear} ลบปีฐาน ${compareYear}; สีส้มคือเข้มขึ้น สีฟ้าคืออ่อนลง`,
        unit: "nW/sr/cm²",
        items: [
          { color: "#08306B", label: "ลดลงมาก", range: "< -8" },
          { color: "#4292C6", label: "ลดลง", range: "-8 ถึง -3" },
          { color: "#F7F7F7", label: "ใกล้เคียงเดิม", range: "-3 ถึง +3" },
          { color: "#F59E0B", label: "เพิ่มขึ้น", range: "+3 ถึง +8" },
          { color: "#B45309", label: "เพิ่มขึ้นมาก", range: "> +8" },
        ],
      }
    : {
        title: "ระดับความเข้มแสงกลางคืน",
        description: "ค่าเฉลี่ย radiance รายปีจาก VIIRS DNB avg_rad หลังกรองเดือนที่ cloud-free coverage ต่ำ",
        unit: "nW/sr/cm²",
        items: [
          { color: "#172554", label: "ต่ำมาก", range: "< 5" },
          { color: "#2563EB", label: "ต่ำ", range: "5 - 15" },
          { color: "#FACC15", label: "ปานกลาง", range: "15 - 35" },
          { color: "#F97316", label: "สูง", range: "35 - 60" },
          { color: "#FFFFFF", label: "สูงมาก", range: "> 60" },
        ],
      };

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden text-slate-50 font-sans">
      <NightLightsSidebar
        onDistrictSelect={setActiveDistrict}
        activeDistrict={activeDistrict}
        summary={summary}
        loading={loading}
        compareMode={compareMode}
      />

      <main className="flex-1 min-w-0 relative">
        <div className="absolute inset-0 z-0">
          <LSTMapView
            geojsonData={geojsonData}
            invertedMask={invertedMask}
            activeDistrict={activeDistrict}
            mapMode={mapMode}
            compareMode={compareMode}
            summary={summary}
            opacity={opacity}
            baseMap={baseMap}
            analysisType="nightlights"
            dataPeriodLabel={periodLabel}
          />
        </div>

        <div className="absolute top-4 left-4 right-4 z-[1000] hidden lg:grid grid-cols-4 gap-2 max-w-4xl mx-auto">
          {kpiCards.map((card) => (
            <div key={card.label} className="bg-[#0f172a]/95 backdrop-blur-md border border-slate-800 rounded-lg p-3 shadow-xl min-w-0">
              <div className="text-[9px] text-slate-500 font-bold tracking-wide leading-tight">{card.label}</div>
              <div className="text-sm font-black text-slate-100 mt-1 truncate">{card.value}</div>
            </div>
          ))}
        </div>

        <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-700/50 shadow-lg pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 bg-yellow-300 rounded-full" />
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Data Source Information</span>
          </div>
          <div className="text-[11px] text-slate-400 leading-relaxed">
            <p><span className="text-white">Satellite:</span> Suomi NPP VIIRS Day/Night Band</p>
            <p><span className="text-white">Dataset:</span> NOAA/VIIRS/DNB/ANNUAL_V22</p>
            <p><span className="text-white">Period:</span> {periodLabel}</p>
            <p><span className="text-white">Band:</span> average_masked · nW/sr/cm²</p>
            <p><span className="text-white">Resolution:</span> ~500m per pixel</p>
          </div>
        </div>

        <div className="absolute bottom-4 right-4 z-[1000] w-80 max-w-[calc(100%-2rem)] rounded-xl border border-slate-700/60 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-md">
          <div className="mb-3">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">สัญลักษณ์แผนที่</h4>
            <p className="mt-1 text-[10px] leading-snug text-slate-400">{legendConfig.title}</p>
            <p className="mt-1 text-[9px] leading-snug text-slate-500">{legendConfig.description}</p>
          </div>
          <div className="space-y-2">
            {legendConfig.items.map((item) => (
              <div key={`${item.color}-${item.range}`} className="grid grid-cols-[14px_1fr_auto] items-center gap-2 text-[10px]">
                <span className="h-3.5 w-3.5 rounded-sm border border-white/10" style={{ backgroundColor: item.color }} />
                <span className="min-w-0 truncate text-slate-300">{item.label}</span>
                <span className="font-mono text-[9px] text-slate-400">{item.range} {legendConfig.unit}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      <aside className="w-80 shrink-0 bg-[#0f172a]/95 border-l border-slate-800/70 shadow-2xl overflow-y-auto custom-scrollbar p-4">
        <div className="flex min-h-full flex-col gap-3">
          <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-full">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                <Layers className="w-3.5 h-3.5" /> แผงควบคุมหลัก
              </h4>
              <button
                onClick={handleReset}
                className="text-[9px] px-2.5 py-1 bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg border border-slate-700 transition-all font-bold"
              >
                RESET
              </button>
            </div>

            <div className="grid grid-cols-2 bg-slate-900/80 rounded-xl p-1 mb-3 border border-slate-800">
              <button
                onClick={() => setMapMode("district")}
                className={`text-[10px] py-2 rounded-lg transition-all font-bold ${mapMode === "district" ? "bg-yellow-400 text-slate-950 shadow-lg shadow-yellow-400/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                รายเขต
              </button>
              <button
                onClick={() => setMapMode("idw")}
                className={`text-[10px] py-2 rounded-lg transition-all font-bold ${mapMode === "idw" ? "bg-yellow-400 text-slate-950 shadow-lg shadow-yellow-400/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                ดาวเทียม (GEE)
              </button>
            </div>

            <button
              onClick={handleExportPlaceholder}
              disabled={isExporting}
              className={`w-full py-2.5 rounded-xl text-[10px] font-bold tracking-widest transition-all border flex items-center justify-center gap-2
                ${isExporting
                  ? "bg-slate-800 border-slate-700 text-slate-500 cursor-wait"
                  : "bg-yellow-400/10 text-yellow-200 border-yellow-300/30 hover:bg-yellow-400 hover:text-slate-950 shadow-lg shadow-yellow-400/5"
                }`}
            >
              {isExporting ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> กำลังเตรียมรายงาน...</>
              ) : (
                <><FileDown className="w-3.5 h-3.5" /> เตรียมรายงานสถิติ</>
              )}
            </button>
          </div>

          {mapMode === "idw" && (
            <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-full">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ความโปร่งใส (Opacity)</h4>
                <span className="text-xs font-mono text-yellow-200 font-bold bg-yellow-300/10 px-2 py-0.5 rounded-full">{Math.round(opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={opacity}
                onChange={(event) => setOpacity(parseFloat(event.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-yellow-300"
              />
            </div>
          )}

          <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-full">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5" /> แผนที่ฐาน (Base Map)
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "dark", label: "Dark" },
                { id: "light", label: "Light" },
                { id: "satellite", label: "Satellite" },
                { id: "streets", label: "Street" },
                { id: "none", label: "None" },
              ].map((map) => (
                <button
                  key={map.id}
                  onClick={() => setBaseMap(map.id as any)}
                  className={`text-[9px] py-2 rounded-lg border transition-all font-bold ${baseMap === map.id ? "bg-yellow-400 border-yellow-400 text-slate-950 shadow-md shadow-yellow-400/20" : "bg-slate-800/50 border-slate-700/50 text-slate-500 hover:border-slate-500 hover:text-slate-300"}`}
                >
                  {map.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-5 border border-slate-800 shadow-2xl w-full">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" /> เลือกปี (Year)
              </h4>
              <button
                onClick={() => setCompareMode(!compareMode)}
                className={`text-[9px] px-3 py-1.5 rounded-lg transition-all border font-bold ${compareMode ? "bg-yellow-300/20 text-yellow-100 border-yellow-300/50" : "bg-transparent text-slate-500 border-slate-700 hover:border-slate-500"}`}
              >
                เปรียบเทียบปี
              </button>
            </div>

            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-mono">{FIRST_YEAR}</span>
              <span className="text-lg font-bold text-yellow-200 font-mono">{selectedYear}</span>
              <span className="text-xs text-slate-400 font-mono">{LATEST_DATA_YEAR}</span>
            </div>
            <input
              type="range"
              min={FIRST_YEAR}
              max={LATEST_DATA_YEAR}
              value={selectedYear}
              onChange={(event) => setSelectedYear(parseInt(event.target.value, 10))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-yellow-300 mb-2"
            />

            {compareMode && (
              <div className="mt-4 pt-4 border-t border-slate-800/50">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-[10px] font-bold text-yellow-100 uppercase tracking-widest">ปีฐานที่ใช้เทียบ (Baseline)</h4>
                  <span className="text-sm font-bold text-yellow-100 font-mono">{compareYear}</span>
                </div>
                <input
                  type="range"
                  min={FIRST_YEAR}
                  max={LATEST_DATA_YEAR}
                  value={compareYear}
                  onChange={(event) => setCompareYear(parseInt(event.target.value, 10))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-yellow-300"
                />
              </div>
            )}
          </div>

          <div className="mt-auto bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-yellow-300/20 shadow-2xl w-full">
            <h4 className="text-[10px] font-bold text-yellow-100 uppercase tracking-widest mb-2 flex items-center gap-2">
              <Moon className="w-3.5 h-3.5" /> Nighttime Lights คืออะไร
            </h4>
            <div className="text-[10px] text-slate-400 leading-relaxed space-y-2">
          <p>VIIRS DNB วัดความสว่างกลางคืนของพื้นผิวโลก ค่า radiance สูงมักสัมพันธ์กับกิจกรรมเมือง ถนน อาคาร พาณิชยกรรม และพื้นที่ที่เปิดไฟต่อเนื่อง</p>
              <p>ข้อมูลนี้เหมาะสำหรับดูแนวโน้มความเข้มเมืองเชิงพื้นที่ แต่ไม่ควรตีความเป็นจำนวนประชากรหรือมูลค่าเศรษฐกิจโดยตรง เพราะแสงไฟถนน ท่าเรือ สนามบิน งานก่อสร้าง หรือแสงสะท้อนมีผลต่อค่าได้</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

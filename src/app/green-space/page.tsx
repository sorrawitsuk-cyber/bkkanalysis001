/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import GreenSpaceSidebar from "@/components/gee/GreenSpaceSidebar";
import { Calendar, Layers } from "lucide-react";
import { formatRai } from "@/lib/ndvi";

const LSTMapView = dynamic(() => import("@/components/gee/LSTMapView"), { ssr: false });

type NdviLayer = "green_area_rai" | "green_area_ratio" | "ndvi_mean";

export default function GreenSpacePage() {
  const [activeDistrict, setActiveDistrict] = useState("ทั้งหมด");
  const [selectedYear, setSelectedYear] = useState(2026);
  const [compareMode, setCompareMode] = useState(false);
  const [compareYear, setCompareYear] = useState(2018);
  const [mapMode, setMapMode] = useState<"district" | "idw">("idw");
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [invertedMask, setInvertedMask] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [opacity, setOpacity] = useState(0.78);
  const [baseMap, setBaseMap] = useState<"dark" | "light" | "satellite" | "streets" | "none">("dark");
  const [ndviLayer, setNdviLayer] = useState<NdviLayer>("green_area_rai");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      year: selectedYear.toString(),
      metric: "vegetation",
    });
    if (activeDistrict !== "ทั้งหมด") params.append("district", activeDistrict);
    if (compareMode) params.append("compareYear", compareYear.toString());

    fetch(`/api/lst?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setGeojsonData(data.geojson);
        setInvertedMask(data.invertedMask);
        setSummary(data.summary);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [activeDistrict, selectedYear, compareMode, compareYear]);

  const handleReset = () => {
    setActiveDistrict("ทั้งหมด");
    setSelectedYear(2026);
    setCompareMode(false);
    setCompareYear(2018);
    setMapMode("idw");
    setOpacity(0.78);
    setBaseMap("dark");
    setNdviLayer("green_area_rai");
  };

  const ndviSummary = summary?.ndviSummary;
  const districtCount = geojsonData?.features?.length || 50;
  const avgGreenAreaRai = ndviSummary?.total_green_area_rai && districtCount
    ? ndviSummary.total_green_area_rai / districtCount
    : null;
  const kpiCards = [
    {
      label: "ค่า NDVI เฉลี่ย กทม.",
      value: ndviSummary?.avg_ndvi_mean !== null && ndviSummary?.avg_ndvi_mean !== undefined ? ndviSummary.avg_ndvi_mean.toFixed(3) : "ไม่มีข้อมูล",
    },
    {
      label: "ขนาดพื้นที่สีเขียวเฉลี่ย",
      value: formatRai(avgGreenAreaRai),
    },
    {
      label: "พื้นที่สีเขียวโดยประมาณ",
      value: formatRai(ndviSummary?.total_green_area_rai),
    },
    {
      label: "เขตสีเขียวสูงสุด",
      value: ndviSummary?.best_district?.district_name || ndviSummary?.best_district?.name_th || "ไม่มีข้อมูล",
    },
    {
      label: "เขตเร่งด่วน",
      value: ndviSummary?.worst_district?.district_name || ndviSummary?.worst_district?.name_th || "ไม่มีข้อมูล",
    },
  ];

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden text-slate-50 font-sans">
      <GreenSpaceSidebar
        onDistrictSelect={setActiveDistrict}
        activeDistrict={activeDistrict}
        summary={summary}
        geojsonData={geojsonData}
        ndviLayer={ndviLayer}
        loading={loading}
        compareMode={compareMode}
      />

      <main className="flex-1 relative">
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
            analysisType="green"
            ndviLayer={ndviLayer}
          />
        </div>

        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] hidden lg:grid grid-cols-5 gap-2 w-[min(980px,calc(100vw-720px))] min-w-[620px]">
          {kpiCards.map((card) => (
            <div key={card.label} className="bg-[#0f172a]/95 backdrop-blur-md border border-slate-800 rounded-lg p-3 shadow-xl min-w-0">
              <div className="text-[9px] text-slate-500 font-bold tracking-wide leading-tight">{card.label}</div>
              <div className="text-sm font-black text-slate-100 mt-1 truncate">{card.value}</div>
            </div>
          ))}
        </div>

        <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-700/50 shadow-lg pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Data Source Information</span>
          </div>
          <div className="text-[11px] text-slate-400 leading-relaxed">
            <p><span className="text-white">Satellite:</span> Landsat 8/9 Collection 2 Level 2</p>
            <p>
              <span className="text-white">Period:</span> Jan 01 - {selectedYear === new Date().getFullYear()
                ? new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit" })
                : "Dec 31"}, {selectedYear}
              {selectedYear === new Date().getFullYear() ? " (Year-to-Date)" : " (Yearly Median)"}
            </p>
            <p><span className="text-white">Resolution:</span> 30m per pixel (NDVI vegetation index)</p>
          </div>
        </div>

        <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-3">
          <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-80">
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

            <div className="grid grid-cols-2 bg-slate-900/80 rounded-xl p-1 border border-slate-800">
              <button
                onClick={() => setMapMode("district")}
                className={`text-[10px] py-2 rounded-lg transition-all font-bold ${mapMode === "district" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                รายเขต (Districts)
              </button>
              <button
                onClick={() => setMapMode("idw")}
                className={`text-[10px] py-2 rounded-lg transition-all font-bold ${mapMode === "idw" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                ดาวเทียม (GEE)
              </button>
            </div>

            <div className="mt-4">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">ชั้นข้อมูล NDVI</h4>
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  ["green_area_rai", "ขนาดพื้นที่สีเขียว"],
                  ["green_area_ratio", "สัดส่วนพื้นที่สีเขียว"],
                  ["ndvi_mean", "ค่า NDVI เฉลี่ย"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setNdviLayer(id as NdviLayer);
                      setMapMode("district");
                    }}
                    className={`text-left text-[10px] px-3 py-2 rounded-lg border transition-all font-bold ${ndviLayer === id ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-300" : "bg-slate-800/40 border-slate-700/50 text-slate-400 hover:text-slate-200"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800/70">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">สัญลักษณ์แผนที่</h4>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  ["#8c2d04", "ต่ำมาก"],
                  ["#d94801", "ต่ำ"],
                  ["#f6e05e", "กลาง"],
                  ["#68d391", "สูง"],
                  ["#238b45", "สูงมาก"],
                ].map(([color, label]) => (
                  <div key={label} className="min-w-0">
                    <span className="block h-2 rounded-sm mb-1" style={{ backgroundColor: color }} />
                    <span className="block text-[8px] text-slate-400 truncate">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {mapMode === "idw" && (
            <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-80">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ความโปร่งใส (Opacity)</h4>
                <span className="text-xs font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">{Math.round(opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
          )}

          <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-80">
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
                  className={`text-[9px] py-2 rounded-lg border transition-all font-bold ${baseMap === map.id ? "bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/20" : "bg-slate-800/50 border-slate-700/50 text-slate-500 hover:border-slate-500 hover:text-slate-300"}`}
                >
                  {map.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-5 border border-slate-800 shadow-2xl w-80">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" /> เลือกปี (Year)
              </h4>
              <button
                onClick={() => setCompareMode(!compareMode)}
                className={`text-[9px] px-3 py-1.5 rounded-lg transition-all border font-bold ${compareMode ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50" : "bg-transparent text-slate-500 border-slate-700 hover:border-slate-500"}`}
              >
                เปรียบเทียบปี
              </button>
            </div>

            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-mono">2018</span>
              <span className="text-lg font-bold text-emerald-400 font-mono">{selectedYear}</span>
              <span className="text-xs text-slate-400 font-mono">2026</span>
            </div>
            <input
              type="range"
              min="2018"
              max="2026"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 mb-2"
            />

            {compareMode && (
              <div className="mt-4 pt-4 border-t border-slate-800/50">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">ปีฐานที่ใช้เทียบ (Baseline)</h4>
                  <span className="text-sm font-bold text-emerald-400 font-mono">{compareYear}</span>
                </div>
                <input
                  type="range"
                  min="2018"
                  max="2026"
                  value={compareYear}
                  onChange={(e) => setCompareYear(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}

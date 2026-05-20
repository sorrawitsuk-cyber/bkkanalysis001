/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import BuiltUpSidebar from "@/components/gee/BuiltUpSidebar";
import { buildSubdistrictGeoJson } from "@/lib/subdistrict-view";
import { Layers } from "lucide-react";
import MonthYearPicker from "@/components/ui/MonthYearPicker";
import ExportPanel from "@/components/ui/ExportPanel";
import { buildPeriodLabel } from "@/lib/export-utils";

// Use dynamic import for Map to prevent SSR issues with Leaflet
const DistrictMetricsMapView = dynamic(() => import("@/components/gee/DistrictMetricsMapView"), { ssr: false });

export default function UrbanExpansionPage() {
  const [activeDistrict, setActiveDistrict] = useState("ทั้งหมด");
  const [selectedYear, setSelectedYear] = useState(2026);
  const [compareMode, setCompareMode] = useState(false);
  const [compareYear, setCompareYear] = useState(2018);
  const [mapMode, setMapMode] = useState<'district' | 'idw'>('idw');
  const [granularity, setGranularity] = useState<"district" | "subdistrict">("district");
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [invertedMask, setInvertedMask] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [opacity, setOpacity] = useState(0.8);
  const [baseMap, setBaseMap] = useState<'dark' | 'light' | 'satellite' | 'streets' | 'none'>('dark');
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ 
      year: selectedYear.toString(),
      metric: 'builtup'
    });
    if (activeDistrict !== 'ทั้งหมด') params.append('district', activeDistrict);
    if (compareMode) params.append('compareYear', compareYear.toString());

    fetch(`/api/district-metrics?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        setGeojsonData(data.geojson);
        setInvertedMask(data.invertedMask);
        setSummary(data.summary);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [activeDistrict, selectedYear, compareMode, compareYear]);

  const displayGeoJson = useMemo(
    () => granularity === "subdistrict" ? buildSubdistrictGeoJson(geojsonData) : geojsonData,
    [geojsonData, granularity],
  );

  const handleReset = () => {
    setActiveDistrict("ทั้งหมด");
    setSelectedYear(2026);
    setSelectedMonth(null);
    setCompareMode(false);
    setCompareYear(2018);
    setMapMode('idw');
    setGranularity("district");
    setOpacity(0.8);
    setBaseMap('dark');
  };

  const hasNdbiData = (summary?.yearlyTrend?.length ?? 0) > 0 || (summary?.ranking?.length ?? 0) > 0;
  const highestDensityDistrict = summary?.ranking?.[0]?.[0] || "ไม่มีข้อมูล";
  const _ueNow = new Date();
  const _ueCurrentYear = _ueNow.getFullYear();
  const _ueEndLabel = selectedYear === _ueCurrentYear
    ? _ueNow.toLocaleDateString("th-TH", { day: "2-digit", month: "short" })
    : "31 ธ.ค.";
  const periodLabel = `1 ม.ค. - ${_ueEndLabel} ${selectedYear}`;

  const rankingForExport: (string | number | null)[][] = (summary?.ranking ?? []).map(
    ([name, val]: [string, number | null]) => [
      name,
      val !== null && val !== undefined ? +Number(val).toFixed(3) : null,
      "NDBI",
      selectedMonth ? buildPeriodLabel(selectedYear, selectedMonth) : periodLabel,
    ],
  );

  const kpiCards = [
    {
      label: compareMode ? "ส่วนต่าง NDBI เฉลี่ย" : "NDBI เฉลี่ย",
      value: !hasNdbiData ? "--"
        : compareMode
          ? `${summary?.avgDelta >= 0 ? "+" : ""}${(summary?.avgDelta ?? 0).toFixed(3)}`
          : (summary?.averageTemp ?? null) !== null ? summary.averageTemp.toFixed(3) : "--",
    },
    {
      label: compareMode ? "การเพิ่มขึ้นสูงสุด" : "สิ่งปลูกสร้างหนาแน่นสุด",
      value: !hasNdbiData ? "--"
        : compareMode
          ? `${(summary?.maxIncreaseDelta ?? summary?.max_delta ?? 0).toFixed(3)}`
          : (summary?.maxTemp ?? null) !== null ? summary.maxTemp.toFixed(3) : "--",
    },
    {
      label: "เขตที่มี NDBI เฉลี่ยสูงสุด",
      value: highestDensityDistrict,
    },
    {
      label: "วันที่/ช่วงข้อมูลดาวเทียม",
      value: compareMode ? `${selectedYear} vs ${compareYear}` : periodLabel,
    },
  ];

  const legendConfig = compareMode
    ? {
        title: "การขยายตัวของเมือง (Urban Expansion)",
        description: `ผลต่างค่า NDBI ปี ${selectedYear} ลบปีฐาน ${compareYear}; สีแดงคือเมืองขยายตัว สีเขียวคือพื้นที่สีเขียวเพิ่ม`,
        note: "การเปลี่ยนแปลงค่า NDBI สุทธิรายพิกเซล จากภาพถ่ายดาวเทียม Sentinel-2",
        unit: "",
        items: [
          { color: "#16A34A", label: "ลดลงมาก", range: "< -0.1" },
          { color: "#84CC16", label: "ลดลง", range: "-0.1 ถึง -0.05" },
          { color: "#F7F7F7", label: "ใกล้เคียงเดิม", range: "-0.05 ถึง +0.05" },
          { color: "#F59E0B", label: "เพิ่มขึ้น", range: "+0.05 ถึง +0.1" },
          { color: "#EF4444", label: "เพิ่มขึ้นมาก", range: "> +0.1" },
        ],
      }
    : {
        title: "ดัชนีพื้นที่สิ่งปลูกสร้าง (NDBI)",
        description: mapMode === "idw"
          ? "ค่า NDBI raster จาก Sentinel-2 แบบ median รายปี"
          : "ค่า NDBI เฉลี่ยรายเขต สะท้อนความหนาแน่นสิ่งปลูกสร้าง",
        note: "ค่าที่สูงแสดงถึงพื้นที่ที่มีความหนาแน่นของอาคาร คอนกรีต และสิ่งปลูกสร้าง",
        unit: "",
        items: [
          { color: "#16A34A", label: "หนาแน่นต่ำมาก", range: "< -0.2" },
          { color: "#84CC16", label: "หนาแน่นต่ำ", range: "-0.2 ถึง 0.0" },
          { color: "#F59E0B", label: "ปานกลาง", range: "0.0 ถึง 0.2" },
          { color: "#EF4444", label: "หนาแน่นสูง", range: "0.2 ถึง 0.4" },
          { color: "#7F1D1D", label: "หนาแน่นสูงมาก", range: "> 0.4" },
        ],
      };

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden text-slate-50 font-sans">
      <BuiltUpSidebar
        onDistrictSelect={setActiveDistrict}
        activeDistrict={activeDistrict}
        summary={summary}
        loading={loading}
        compareMode={compareMode}
        granularity={granularity}
        subdistrictFeatures={granularity === "subdistrict" ? (displayGeoJson?.features ?? []) : []}
      />

      <main className="flex-1 min-w-0 relative">
        <div className="absolute inset-0 z-0">
            <DistrictMetricsMapView
              geojsonData={displayGeoJson}
              invertedMask={invertedMask}
              activeDistrict={activeDistrict}
              mapMode={mapMode}
              compareMode={compareMode}
              summary={summary}
              opacity={opacity}
              baseMap={baseMap}
              analysisType="builtup"
              dataPeriodLabel={periodLabel}
              granularity={granularity}
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

        {/* Data Source Badge */}
        <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-700/50 shadow-lg pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Data Source Information</span>
          </div>
          <div className="text-[11px] text-slate-400 leading-relaxed">
            <p><span className="text-white">Satellite:</span> Sentinel-2 SR Harmonized</p>
            {compareMode ? (
              <>
                <p><span className="text-white">Period {selectedYear}:</span> Jan 01 – {selectedYear === _ueCurrentYear ? _ueNow.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) : 'Dec 31'}, {selectedYear}{selectedYear === _ueCurrentYear ? ' (YTD)' : ''}</p>
                <p><span className="text-white">Period {compareYear}:</span> Jan 01 – {selectedYear === _ueCurrentYear ? _ueNow.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) : 'Dec 31'}, {compareYear}</p>
              </>
            ) : (
              <p><span className="text-white">Period:</span> Jan 01 – {selectedYear === _ueCurrentYear ? _ueNow.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) : 'Dec 31'}, {selectedYear}{selectedYear === _ueCurrentYear ? ' (YTD)' : ''}</p>
            )}
            <p><span className="text-white">Resolution:</span> 10m per pixel (NDBI)</p>
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
          <p className="mt-3 border-t border-slate-800 pt-2 text-[9px] leading-snug text-slate-500">{legendConfig.note}</p>
        </div>

      </main>

      <aside className="w-80 shrink-0 bg-[#0f172a]/95 border-l border-slate-800/70 shadow-2xl overflow-y-auto custom-scrollbar p-4">
        <div className="flex min-h-full flex-col gap-3">
          
          {/* Map Style & Main Controls */}
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

            {/* Granularity Toggle */}
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">ขอบเขต</p>
            <div className="grid grid-cols-2 bg-slate-900/80 rounded-xl p-1 mb-3 border border-slate-800">
              <button
                onClick={() => setGranularity("district")}
                className={`text-[10px] py-2 rounded-lg transition-all font-bold ${granularity === "district" && mapMode === 'district' ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                เขต (50)
              </button>
              <button
                onClick={() => setGranularity("subdistrict")}
                className={`text-[10px] py-2 rounded-lg transition-all font-bold ${granularity === "subdistrict" && mapMode === 'district' ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                แขวง (180)
              </button>
            </div>

            {/* Mode Toggle */}
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">รูปแบบ</p>
            <div className="grid grid-cols-2 bg-slate-900/80 rounded-xl p-1 mb-3 border border-slate-800">
              <button
                onClick={() => setMapMode('district')}
                className={`text-[10px] py-2 rounded-lg transition-all font-bold ${mapMode === 'district' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
              >
                สถิติ
              </button>
              <button
                onClick={() => setMapMode('idw')}
                className={`text-[10px] py-2 rounded-lg transition-all font-bold ${mapMode === 'idw' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
              >
                ดาวเทียม (GEE)
              </button>
            </div>

          </div>

          {/* Opacity Slider */}
          {mapMode === 'idw' && (
            <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-full">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  ความโปร่งใส (Opacity)
                </h4>
                <span className="text-xs font-mono text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded-full">{Math.round(opacity * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                value={opacity} 
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
          )}

          {/* Base Map Selector */}
          <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-full">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5" /> แผนที่ฐาน (Base Map)
              </div>
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'dark', label: 'Dark' },
                { id: 'light', label: 'Light' },
                { id: 'satellite', label: 'Satellite' },
                { id: 'streets', label: 'Street' },
                { id: 'none', label: 'None' }
              ].map((map) => (
                <button
                  key={map.id}
                  onClick={() => setBaseMap(map.id as any)}
                  className={`text-[9px] py-2 rounded-lg border transition-all font-bold ${
                    baseMap === map.id 
                      ? 'bg-indigo-500 border-indigo-500 text-white shadow-md shadow-indigo-500/20' 
                      : 'bg-slate-800/50 border-slate-700/50 text-slate-500 hover:border-slate-500 hover:text-slate-300'
                  }`}
                >
                  {map.label}
                </button>
              ))}
            </div>
          </div>

          <MonthYearPicker
            year={selectedYear}
            month={selectedMonth}
            minYear={2018}
            maxYear={2026}
            onYearChange={setSelectedYear}
            onMonthChange={setSelectedMonth}
            accentColor="indigo"
            compareMode={compareMode}
            compareYear={compareYear}
            onCompareModeChange={setCompareMode}
            onCompareYearChange={setCompareYear}
          />

          <ExportPanel
            accentColor="indigo"
            csvFilename={`urban-expansion_NDBI_${selectedYear}`}
            csvHeaders={["เขต", "NDBI เฉลี่ย", "ดัชนี", "ช่วงเวลา"]}
            csvRows={rankingForExport}
            reportData={{
              title: "วิเคราะห์การขยายตัวเมือง",
              subtitle: "Sentinel-2 · Normalized Difference Built-up Index",
              source: "Sentinel-2",
              period: selectedMonth ? buildPeriodLabel(selectedYear, selectedMonth) : periodLabel,
              layer: "NDBI (Built-up Index)",
              district: activeDistrict,
              kpis: [
                { label: "NDBI เฉลี่ย", value: summary?.averageTemp !== null && summary?.averageTemp !== undefined ? summary.averageTemp.toFixed(3) : "–" },
                { label: "เขตหนาแน่นสุด", value: highestDensityDistrict },
                { label: "ช่วงเวลา", value: compareMode ? `${selectedYear} vs ${compareYear}` : String(selectedYear) },
              ],
              rankingHeaders: ["เขต", "NDBI"],
              rankingRows: rankingForExport.map(([n, v]) => [n, v]),
            }}
          />

          <div className="mt-auto space-y-3">
            {[
              {
                title: "NDBI คืออะไร?",
                body: "Normalized Difference Built-up Index (NDBI) คือดัชนีชี้วัดความหนาแน่นของสิ่งปลูกสร้าง คำนวณจากความแตกต่างของการสะท้อนแสงอินฟราเรดคลื่นสั้น (SWIR) และอินฟราเรดใกล้ (NIR) ใช้สำหรับระบุพื้นที่ผิวคอนกรีต อาคาร และสิ่งปลูกสร้างจากภาพถ่ายดาวเทียม",
              },
              {
                title: "วิเคราะห์การขยายตัวของเมือง",
                body: "ด้วยข้อมูล NDBI แบบเปรียบเทียบระหว่างปี เราสามารถมองเห็นทิศทางการขยายตัวของเมือง (Urban Expansion) พื้นที่ที่มีการก่อสร้างใหม่ หรือการเปลี่ยนแปลงการใช้ประโยชน์ที่ดิน (Land Use Change) ได้อย่างชัดเจน",
              },
            ].map((card) => (
              <div key={card.title} className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-indigo-500/20 shadow-2xl w-full">
                <h4 className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-2">{card.title}</h4>
                <p className="text-[10px] text-slate-400 leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>

        </div>
      </aside>
    </div>
  );
}

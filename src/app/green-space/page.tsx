/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import GreenSpaceSidebar from "@/components/gee/GreenSpaceSidebar";
import A4Report from "@/components/gee/A4Report";
import { Calendar, Database, FileDown, Layers, RefreshCw } from "lucide-react";
import { formatRai } from "@/lib/ndvi";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  fetchCacheIndex,
  fetchCacheMetadata,
  getCacheLayerPreviewUrl,
  formatPeriodThai,
  CACHE_LAYER_LABELS,
  type SatelliteCacheIndex,
  type SatelliteCacheMetadata,
} from "@/lib/satellite-cache";

const LSTMapView = dynamic(() => import("@/components/gee/LSTMapView"), { ssr: false });

type NdviLayer = "green_area_rai" | "green_area_ratio" | "ndvi_mean";
type MapMode  = "district" | "idw" | "satellite-cache";

export default function GreenSpacePage() {
  const [activeDistrict, setActiveDistrict] = useState("ทั้งหมด");
  const [selectedYear, setSelectedYear] = useState(2026);
  const [compareMode, setCompareMode] = useState(false);
  const [compareYear, setCompareYear] = useState(2018);
  const [mapMode, setMapMode] = useState<MapMode>("idw");
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [invertedMask, setInvertedMask] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [opacity, setOpacity] = useState(0.78);
  const [baseMap, setBaseMap] = useState<"dark" | "light" | "satellite" | "streets" | "none">("dark");
  const [ndviLayer, setNdviLayer] = useState<NdviLayer>("ndvi_mean");

  // Satellite cache state
  const [cacheIndex, setCacheIndex] = useState<SatelliteCacheIndex | null>(null);
  const [cacheMeta, setCacheMeta] = useState<SatelliteCacheMetadata | null>(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheLayer, setCacheLayer] = useState("ndvi_mean");
  const [cachePeriod, setCachePeriod] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [mapSnapshot, setMapSnapshot] = useState<string | null>(null);

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

  // Load index on mount
  useEffect(() => {
    fetchCacheIndex().then(setCacheIndex);
  }, []);

  // Set default period when entering cache mode (or when index arrives)
  useEffect(() => {
    if (mapMode === "satellite-cache" && !cachePeriod && cacheIndex?.latest_month) {
      setCachePeriod(cacheIndex.latest_month);
    }
  }, [mapMode, cacheIndex, cachePeriod]);

  // Load metadata whenever selected period changes
  useEffect(() => {
    if (mapMode !== "satellite-cache" || !cachePeriod) return;
    setCacheLoading(true);
    fetchCacheMetadata("monthly", cachePeriod)
      .then((meta) => { setCacheMeta(meta ?? null); setCacheLoading(false); })
      .catch(() => setCacheLoading(false));
  }, [cachePeriod, mapMode]);

  const handleReset = () => {
    setActiveDistrict("ทั้งหมด");
    setSelectedYear(2026);
    setCompareMode(false);
    setCompareYear(2018);
    setMapMode("idw");
    setOpacity(0.78);
    setBaseMap("dark");
    setNdviLayer("ndvi_mean");
    setCacheMeta(null);
    setCacheLoading(false);
    setCacheLayer("ndvi_mean");
    setCachePeriod(null);
  };

  const handleExportPDF = async () => {
    setIsExporting(true);

    const mapContainer = document.querySelector(".leaflet-container") as HTMLElement;
    let imgDataUrl: string | null = null;
    if (mapContainer) {
      try {
        const mapCanvas = await html2canvas(mapContainer, { useCORS: true, allowTaint: true, scale: 2 });
        imgDataUrl = mapCanvas.toDataURL("image/png");
      } catch (err) {
        console.warn("Map capture failed", err);
      }
    }
    setMapSnapshot(imgDataUrl);

    await new Promise((resolve) => setTimeout(resolve, 800));

    const element = document.getElementById("a4-report");
    if (element) {
      try {
        const canvas = await html2canvas(element, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
        pdf.save(`BKK_Green_Space_Report_${selectedYear}_${activeDistrict}.pdf`);
      } catch (err) {
        console.error("Error generating PDF", err);
        alert("เกิดข้อผิดพลาดในการสร้าง PDF");
      }
    }
    setMapSnapshot(null);
    setIsExporting(false);
  };

  const cachePreviewUrl = getCacheLayerPreviewUrl(cacheMeta, cacheLayer);

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
  const periodLabel = selectedYear === new Date().getFullYear()
    ? `1 ม.ค. - ${new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "short" })} ${selectedYear} (YTD)`
    : `1 ม.ค. - 31 ธ.ค. ${selectedYear}`;
  const legendConfig = (() => {
    if (compareMode) {
      return {
        title: "การเปลี่ยนแปลง NDVI รายปี",
        description: `ค่า NDVI ปี ${selectedYear} ลบปีฐาน ${compareYear}; ค่าบวกหมายถึงพื้นที่เขียวเพิ่มขึ้น`,
        unit: "NDVI",
        items: [
          { color: "#8B1E1E", label: "ลดลงมาก", range: "< -0.15" },
          { color: "#F59E0B", label: "ลดลง", range: "-0.15 ถึง -0.05" },
          { color: "#F7F7F7", label: "ใกล้เคียงเดิม", range: "-0.05 ถึง +0.05" },
          { color: "#86EFAC", label: "เพิ่มขึ้น", range: "+0.05 ถึง +0.15" },
          { color: "#047857", label: "เพิ่มขึ้นมาก", range: "> +0.15" },
        ],
      };
    }

    if (mapMode === "satellite-cache") {
      if (cacheLayer === "ndwi_mean" || cacheLayer === "ndwi_max") {
        return {
          title: `NDWI — ดัชนีน้ำผิวดิน (${CACHE_LAYER_LABELS[cacheLayer]})`,
          description: "ค่าสูง = น้ำผิวดิน / ความชื้นสูง  ค่าต่ำ = ดินแห้ง พืช หรือสิ่งปลูกสร้าง",
          unit: "",
          items: [
            { color: "#92400E", label: "ดินแห้ง/พืช", range: "< -0.30" },
            { color: "#C4974A", label: "กึ่งแห้ง", range: "-0.30 ถึง -0.10" },
            { color: "#F7F7F7", label: "กลาง", range: "-0.10 ถึง 0.10" },
            { color: "#7EC8E3", label: "ชื้น/น้ำตื้น", range: "0.10 ถึง 0.30" },
            { color: "#0369A1", label: "น้ำผิวดิน", range: "> 0.30" },
          ],
        };
      }
      if (cacheLayer === "mndwi_mean") {
        return {
          title: "MNDWI — ดัชนีน้ำในเมือง (mean)",
          description: "แม่นกว่า NDWI ในพื้นที่เมือง ลดการรบกวนจากสิ่งปลูกสร้าง",
          unit: "",
          items: [
            { color: "#92400E", label: "ดิน/พืช", range: "< -0.30" },
            { color: "#C4974A", label: "กึ่งแห้ง", range: "-0.30 ถึง -0.10" },
            { color: "#F7F7F7", label: "กลาง", range: "-0.10 ถึง 0.10" },
            { color: "#60ACD8", label: "น้ำตื้น/ชื้น", range: "0.10 ถึง 0.30" },
            { color: "#0284C7", label: "น้ำ/คลอง", range: "> 0.30" },
          ],
        };
      }
      if (cacheLayer === "ndbi_mean") {
        return {
          title: "NDBI — ดัชนีสิ่งปลูกสร้าง (mean)",
          description: "ค่าสูง = พื้นที่สิ่งปลูกสร้าง  ค่าต่ำ = พืชพรรณหนาแน่น",
          unit: "",
          items: [
            { color: "#065F46", label: "พืชพรรณหนาแน่น", range: "< -0.30" },
            { color: "#4CAF7D", label: "กึ่งพืชพรรณ", range: "-0.30 ถึง -0.10" },
            { color: "#F7F7F7", label: "กลาง/ผสม", range: "-0.10 ถึง 0.10" },
            { color: "#C07070", label: "กึ่งสิ่งปลูกสร้าง", range: "0.10 ถึง 0.30" },
            { color: "#7F1D1D", label: "สิ่งปลูกสร้างหนาแน่น", range: "> 0.30" },
          ],
        };
      }
      // ndvi_mean / ndvi_max
      return {
        title: `NDVI — พืชพรรณ (${CACHE_LAYER_LABELS[cacheLayer] ?? cacheLayer})`,
        description: `ภาพ composite รายเดือน${cacheMeta?.period ? ` · ${formatPeriodThai(cacheMeta.period)}` : ""} · ตัดพื้นที่น้ำออกแล้ว`,
        unit: "",
        items: [
          { color: "#7F1D1D", label: "เขียวน้อยมาก", range: "0.10 - 0.25" },
          { color: "#B45309", label: "เขียวน้อย", range: "0.25 - 0.40" },
          { color: "#FACC15", label: "ปานกลาง", range: "0.40 - 0.55" },
          { color: "#84CC16", label: "ดี", range: "0.55 - 0.70" },
          { color: "#16A34A", label: "ดีมาก", range: "0.70 - 0.80" },
          { color: "#065F46", label: "หนาแน่นมาก", range: "> 0.80" },
        ],
      };
    }

    if (mapMode === "idw") {
      return {
        title: "NDVI จากดาวเทียม Sentinel-2",
        description: "ค่า NDVI raster จากภาพ Sentinel-2 แบบ median รายปี หลังคัดกรองเมฆ",
        unit: "NDVI",
        items: [
          { color: "#7F1D1D", label: "เขียวน้อยมาก", range: "0.10 - 0.24" },
          { color: "#B45309", label: "เขียวน้อย", range: "0.24 - 0.38" },
          { color: "#FACC15", label: "ปานกลาง", range: "0.38 - 0.52" },
          { color: "#84CC16", label: "ดี", range: "0.52 - 0.66" },
          { color: "#16A34A", label: "ดีมาก", range: "0.66 - 0.80" },
          { color: "#065F46", label: "หนาแน่นมาก", range: "> 0.80" },
        ],
      };
    }

    if (ndviLayer === "green_area_rai") {
      return {
        title: "ขนาดพื้นที่สีเขียวรายเขต",
        description: "ประมาณพื้นที่ที่มี NDVI มากกว่า 0.30 แสดงเป็นไร่ต่อเขต",
        unit: "ไร่",
        items: [
          { color: "#8c2d04", label: "น้อยมาก", range: "< 4,000" },
          { color: "#d94801", label: "น้อย", range: "4,000 - 8,000" },
          { color: "#f6e05e", label: "ปานกลาง", range: "8,000 - 12,000" },
          { color: "#68d391", label: "มาก", range: "12,000 - 16,000" },
          { color: "#238b45", label: "มากที่สุด", range: "> 16,000" },
        ],
      };
    }

    if (ndviLayer === "green_area_ratio") {
      return {
        title: "สัดส่วนพื้นที่สีเขียวรายเขต",
        description: "สัดส่วนพื้นที่ที่มี NDVI มากกว่า 0.30 เมื่อเทียบกับพื้นที่เขต",
        unit: "%",
        items: [
          { color: "#8c2d04", label: "น้อยมาก", range: "< 14%" },
          { color: "#d94801", label: "น้อย", range: "14% - 28%" },
          { color: "#f6e05e", label: "ปานกลาง", range: "28% - 42%" },
          { color: "#68d391", label: "ดี", range: "42% - 56%" },
          { color: "#238b45", label: "ดีมาก", range: "> 56%" },
        ],
      };
    }

    return {
      title: "ค่า NDVI เฉลี่ยรายเขต",
      description: "ค่า NDVI เฉลี่ยของแต่ละเขต ใช้แปลความหนาแน่นพืชพรรณในเมือง",
      unit: "NDVI",
      items: [
        { color: "#8c2d04", label: "เขียวน้อยมาก", range: "< 0.20" },
        { color: "#d94801", label: "เขียวน้อย", range: "0.20 - 0.30" },
        { color: "#f6e05e", label: "ปานกลาง", range: "0.30 - 0.40" },
        { color: "#68d391", label: "ดี", range: "0.40 - 0.50" },
        { color: "#238b45", label: "ดีมาก", range: "> 0.50" },
      ],
    };
  })();

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
            analysisType="green"
            ndviLayer={ndviLayer}
            satelliteCachePreviewUrl={cachePreviewUrl}
          />
        </div>

        <div className="absolute top-4 left-4 right-4 z-[1000] hidden lg:grid grid-cols-5 gap-2 max-w-5xl mx-auto">
          {kpiCards.map((card) => (
            <div key={card.label} className="bg-[#0f172a]/95 backdrop-blur-md border border-slate-800 rounded-lg p-3 shadow-xl min-w-0">
              <div className="text-[9px] text-slate-500 font-bold tracking-wide leading-tight">{card.label}</div>
              <div className="text-sm font-black text-slate-100 mt-1 truncate">{card.value}</div>
            </div>
          ))}
        </div>

        <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-700/50 shadow-lg pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full ${mapMode === "satellite-cache" ? "bg-sky-400" : "bg-emerald-500"}`} />
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Data Source Information</span>
          </div>
          <div className="text-[11px] text-slate-400 leading-relaxed">
            <p><span className="text-white">Satellite:</span> Sentinel-2 SR Harmonized</p>
            {mapMode === "satellite-cache" && cacheMeta?.status === "ok" ? (
              <>
                <p><span className="text-white">Period:</span> {formatPeriodThai(cacheMeta.period)} · {cacheMeta.image_count} scenes{cacheMeta.fallback_used ? " (fallback)" : ""}</p>
                <p><span className="text-white">Layer:</span> {CACHE_LAYER_LABELS[cacheLayer] ?? cacheLayer}</p>
                <p><span className="text-white">Method:</span> monthly composite · cloud + water masked</p>
                <p><span className="text-white">Resolution:</span> 100m per pixel (R2 cache)</p>
              </>
            ) : (
              <>
                <p><span className="text-white">Period:</span> {periodLabel}</p>
                <p><span className="text-white">Method:</span> yearly median NDVI · cloud + water masked</p>
                <p><span className="text-white">Resolution:</span> 10m per pixel</p>
              </>
            )}
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

        {/* Hidden A4 Report for PDF export */}
        <A4Report
          type="ndvi"
          summary={summary}
          geojsonData={geojsonData}
          activeDistrict={activeDistrict}
          selectedYear={selectedYear}
          compareMode={compareMode}
          compareYear={compareYear}
          mapSnapshot={mapSnapshot}
          mapMode={mapMode}
        />

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

            <div className="grid grid-cols-3 bg-slate-900/80 rounded-xl p-1 border border-slate-800">
              <button
                onClick={() => setMapMode("district")}
                className={`text-[9px] py-2 rounded-lg transition-all font-bold ${mapMode === "district" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                รายเขต
              </button>
              <button
                onClick={() => {
                  setMapMode("idw");
                  setNdviLayer("ndvi_mean");
                }}
                className={`text-[9px] py-2 rounded-lg transition-all font-bold ${mapMode === "idw" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                GEE Live
              </button>
              <button
                onClick={() => setMapMode("satellite-cache")}
                className={`text-[9px] py-2 rounded-lg transition-all font-bold flex items-center justify-center gap-1 ${mapMode === "satellite-cache" ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20" : "text-slate-500 hover:text-slate-300"}`}
              >
                <Database className="w-2.5 h-2.5" />
                Cache
              </button>
            </div>

            {/* Export Button */}
            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              className={`mt-3 w-full py-2.5 rounded-xl text-[10px] font-bold tracking-widest transition-all border flex items-center justify-center gap-2
                ${isExporting
                  ? "bg-slate-800 border-slate-700 text-slate-500 cursor-wait"
                  : "bg-emerald-600/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-600 hover:text-white shadow-lg shadow-emerald-500/5"
                }`}
            >
              {isExporting ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> กำลังสร้างรายงาน...</>
              ) : (
                <><FileDown className="w-3.5 h-3.5" /> นำออกรายงานสรุป (PDF)</>
              )}
            </button>

            {mapMode === "district" && (
              <div className="mt-4">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">ชั้นข้อมูลรายเขต</h4>
                <div className="grid grid-cols-1 gap-1.5">
                  {[
                    ["green_area_rai", "ขนาดพื้นที่สีเขียว"],
                    ["green_area_ratio", "สัดส่วนพื้นที่สีเขียว"],
                    ["ndvi_mean", "ค่า NDVI เฉลี่ย"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setNdviLayer(id as NdviLayer)}
                      className={`text-left text-[10px] px-3 py-2 rounded-lg border transition-all font-bold ${ndviLayer === id ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-300" : "bg-slate-800/40 border-slate-700/50 text-slate-400 hover:text-slate-200"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mapMode === "idw" && (
              <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                <h4 className="text-[10px] font-bold text-slate-400 mb-1">GEE Raster (Live)</h4>
                <p className="text-[9px] text-slate-500 leading-snug">
                  แสดงค่า NDVI เฉลี่ยจาก Sentinel-2 คำนวณสด ส่วนขนาดและสัดส่วนดูได้ในโหมดรายเขต
                </p>
              </div>
            )}

            {mapMode === "satellite-cache" && (
              <div className="mt-4 rounded-lg border border-sky-800/50 bg-sky-950/30 p-3 space-y-2">
                <h4 className="text-[10px] font-bold text-sky-300 mb-1 flex items-center gap-1">
                  <Database className="w-3 h-3" /> Satellite Cache (R2)
                </h4>
                {/* Period selector */}
                {cacheIndex?.monthly && cacheIndex.monthly.length > 0 && (
                  <div>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">เดือน</p>
                    <select
                      value={cachePeriod ?? ""}
                      onChange={(e) => setCachePeriod(e.target.value)}
                      className="w-full bg-slate-900/60 border border-sky-800/40 text-slate-200 text-[10px] rounded-lg px-2 py-1.5 appearance-none focus:outline-none focus:border-sky-500/60 cursor-pointer"
                    >
                      {[...cacheIndex.monthly].reverse().map((p) => (
                        <option key={p} value={p}>{formatPeriodThai(p)}</option>
                      ))}
                    </select>
                  </div>
                )}

                {cacheLoading ? (
                  <p className="text-[9px] text-slate-500">กำลังโหลดข้อมูล...</p>
                ) : cacheMeta?.status === "ok" ? (
                  <>
                    <p className="text-[9px] text-slate-400">
                      <span className="text-slate-200 font-bold">จำนวนภาพ:</span>{" "}
                      {cacheMeta.image_count} scenes
                      {cacheMeta.fallback_used && (
                        <span className="text-amber-400 ml-1">(fallback range)</span>
                      )}
                    </p>
                    <div className="mt-1">
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1.5">ชั้นข้อมูล</p>
                      <div className="grid grid-cols-2 gap-1">
                        {Object.entries(CACHE_LAYER_LABELS).map(([key, label]) => (
                          <button
                            key={key}
                            onClick={() => setCacheLayer(key)}
                            className={`text-[9px] px-2 py-1.5 rounded-lg border transition-all font-bold text-left ${cacheLayer === key ? "bg-sky-500/20 border-sky-500/60 text-sky-300" : "bg-slate-800/40 border-slate-700/50 text-slate-400 hover:text-slate-200"}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {!cachePreviewUrl && (
                      <p className="text-[9px] text-amber-400">ยังไม่มี preview สำหรับ layer นี้</p>
                    )}
                  </>
                ) : cacheMeta?.status === "insufficient_data" || cacheMeta?.status === "pending" ? (
                  <p className="text-[9px] text-amber-400">
                    ข้อมูลช่วงนี้ยังไม่พร้อม (ภาพถ่ายน้อยเกินไป)
                  </p>
                ) : (
                  <p className="text-[9px] text-slate-500">
                    ยังไม่มีข้อมูล cache — รัน GitHub Action เพื่อประมวลผลครั้งแรก
                  </p>
                )}
              </div>
            )}

          </div>

          {(mapMode === "idw" || mapMode === "satellite-cache") && (
            <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-full">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ความโปร่งใส (Opacity)</h4>
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${mapMode === "satellite-cache" ? "text-sky-400 bg-sky-500/10" : "text-emerald-400 bg-emerald-500/10"}`}>{Math.round(opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className={`w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer ${mapMode === "satellite-cache" ? "accent-sky-400" : "accent-emerald-500"}`}
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
                  className={`text-[9px] py-2 rounded-lg border transition-all font-bold ${baseMap === map.id ? "bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/20" : "bg-slate-800/50 border-slate-700/50 text-slate-500 hover:border-slate-500 hover:text-slate-300"}`}
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
          <div className="mt-auto bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-emerald-500/20 shadow-2xl w-full">
            <h4 className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest mb-2">NDVI คืออะไร</h4>
            <div className="text-[10px] text-slate-400 leading-relaxed space-y-2">
              <p>
                <span className="text-slate-100 font-bold">NDVI</span> คือดัชนีจากภาพดาวเทียมที่ดูความต่างระหว่างแสงใกล้อินฟราเรดกับแสงสีแดง เพื่อประเมินความเขียวและความสมบูรณ์ของพืชพรรณ
              </p>
              <p>
                ค่าใกล้ <span className="text-emerald-300 font-mono">1</span> มักหมายถึงพืชพรรณหนาแน่น ค่าใกล้ <span className="text-slate-200 font-mono">0</span> คือพื้นที่เมือง ดิน หรือพื้นผิวแข็ง และค่าติดลบมักสัมพันธ์กับน้ำหรือเงา
              </p>
              <p>
                ควรใช้ NDVI ดูแนวโน้มและเปรียบเทียบพื้นที่ร่วมกับข้อมูลภาคสนาม เพราะฤดูกาล เมฆ เงาอาคาร และชนิดพื้นผิวเมืองมีผลต่อค่าได้
              </p>
            </div>
          </div>

        </div>
      </aside>
    </div>
  );
}


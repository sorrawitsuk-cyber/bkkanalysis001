/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import BuiltUpSidebar from "@/components/gee/BuiltUpSidebar";
import A4Report from "@/components/gee/A4Report";
import { Layers, FileDown, RefreshCw, Calendar, Building2 } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// Use dynamic import for Map to prevent SSR issues with Leaflet
const LSTMapView = dynamic(() => import("@/components/gee/LSTMapView"), { ssr: false });

export default function UrbanExpansionPage() {
  const [activeDistrict, setActiveDistrict] = useState("ทั้งหมด");
  const [selectedYear, setSelectedYear] = useState(2024);
  const [compareMode, setCompareMode] = useState(false);
  const [compareYear, setCompareYear] = useState(2018);
  const [mapMode, setMapMode] = useState<'district' | 'idw'>('idw');
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [invertedMask, setInvertedMask] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [opacity, setOpacity] = useState(0.8);
  const [baseMap, setBaseMap] = useState<'dark' | 'light' | 'satellite' | 'streets' | 'none'>('dark');
  const [isExporting, setIsExporting] = useState(false);
  const [mapSnapshot, setMapSnapshot] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ 
      year: selectedYear.toString(),
      metric: 'builtup'
    });
    if (activeDistrict !== 'ทั้งหมด') params.append('district', activeDistrict);
    if (compareMode) params.append('compareYear', compareYear.toString());

    fetch(`/api/lst?${params.toString()}`)
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

  const handleReset = () => {
    setActiveDistrict("ทั้งหมด");
    setSelectedYear(2024);
    setCompareMode(false);
    setCompareYear(2018);
    setMapMode('idw');
    setOpacity(0.8);
    setBaseMap('dark');
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    
    // 1. Capture Map
    const mapContainer = document.querySelector('.leaflet-container') as HTMLElement;
    let imgDataUrl = null;
    if (mapContainer) {
      try {
        const mapCanvas = await html2canvas(mapContainer, { useCORS: true, allowTaint: true, scale: 2 });
        imgDataUrl = mapCanvas.toDataURL('image/png');
      } catch (err) {
        console.warn('Map capture failed', err);
      }
    }
    setMapSnapshot(imgDataUrl);
    
    // Wait for react to render the image in the hidden report
    await new Promise(resolve => setTimeout(resolve, 800));

    const element = document.getElementById("a4-report");
    if (element) {
      try {
        const canvas = await html2canvas(element, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4",
        });
        
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
        pdf.save(`BKK_UrbanExpansion_Report_${selectedYear}_${activeDistrict}.pdf`);
      } catch (err) {
        console.error("Error generating PDF", err);
        alert("เกิดข้อผิดพลาดในการสร้าง PDF");
      }
    }
    setMapSnapshot(null);
    setIsExporting(false);
  };

  const highestDensityDistrict = summary?.ranking?.[0]?.[0] || "ไม่มีข้อมูล";
  const periodLabel = (() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const endLabel = selectedYear === currentYear
      ? now.toLocaleDateString("th-TH", { day: "2-digit", month: "short" })
      : "31 ธ.ค.";
    return `1 ม.ค. - ${endLabel} ${selectedYear}`;
  })();

  const kpiCards = [
    {
      label: compareMode ? "ส่วนต่าง NDBI เฉลี่ย" : "NDBI เฉลี่ย",
      value: compareMode
        ? `${summary?.avgDelta >= 0 ? "+" : ""}${(summary?.avgDelta ?? 0).toFixed(3)}`
        : summary?.averageTemp !== null && summary?.averageTemp !== undefined
          ? summary.averageTemp.toFixed(3)
          : "ไม่มีข้อมูล",
    },
    {
      label: compareMode ? "การเพิ่มขึ้นสูงสุด" : "สิ่งปลูกสร้างหนาแน่นสุด",
      value: compareMode
        ? `${(summary?.maxIncreaseDelta ?? summary?.max_delta ?? 0).toFixed(3)}`
        : summary?.maxTemp !== null && summary?.maxTemp !== undefined
          ? summary.maxTemp.toFixed(3)
          : "ไม่มีข้อมูล",
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

  const legendConfig = (() => {
    if (compareMode) {
      return {
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
      };
    }

    return {
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
      ]
    };
  })();

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden text-slate-50 font-sans">
      <BuiltUpSidebar
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
              analysisType="builtup"
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

        {/* Hidden Report Component for PDF Export */}
        <A4Report
          type="builtup"
          summary={summary}
          geojsonData={geojsonData}
          activeDistrict={activeDistrict}
          selectedYear={selectedYear}
          compareMode={compareMode}
          compareYear={compareYear}
          mapSnapshot={mapSnapshot}
          mapMode={mapMode}
        />

        {/* Data Source Badge */}
        <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-700/50 shadow-lg pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Data Source Information</span>
          </div>
          <div className="text-[11px] text-slate-400 leading-relaxed">
            <p><span className="text-white">Satellite:</span> Sentinel-2 SR Harmonized</p>
            {(() => {
              const now = new Date();
              const currentYear = now.getFullYear();
              const todayStr = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
              const endLabel = (y: number) => y === currentYear ? todayStr : 'Dec 31';
              const suffix = (y: number) => y === currentYear ? ' (YTD)' : '';
              return compareMode ? (
                <>
                  <p><span className="text-white">Period {selectedYear}:</span> Jan 01 – {endLabel(selectedYear)}, {selectedYear}{suffix(selectedYear)}</p>
                  <p><span className="text-white">Period {compareYear}:</span> Jan 01 – {endLabel(selectedYear)}, {compareYear}</p>
                </>
              ) : (
                <p><span className="text-white">Period:</span> Jan 01 – {endLabel(selectedYear)}, {selectedYear}{suffix(selectedYear)}</p>
              );
            })()}
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

            {/* Mode Toggle */}
            <div className="grid grid-cols-2 bg-slate-900/80 rounded-xl p-1 mb-3 border border-slate-800">
              <button
                onClick={() => setMapMode('district')}
                className={`text-[10px] py-2 rounded-lg transition-all font-bold ${mapMode === 'district' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
              >
                รายเขต (Districts)
              </button>
              <button
                onClick={() => setMapMode('idw')}
                className={`text-[10px] py-2 rounded-lg transition-all font-bold ${mapMode === 'idw' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
              >
                ดาวเทียม (GEE)
              </button>
            </div>

            {/* Export Button - Full Width */}
            <button 
              onClick={handleExportPDF}
              disabled={isExporting}
              className={`w-full py-2.5 rounded-xl text-[10px] font-bold tracking-widest transition-all border flex items-center justify-center gap-2
                ${isExporting 
                  ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-wait' 
                  : 'bg-indigo-600/10 text-indigo-400 border-indigo-500/30 hover:bg-indigo-600 hover:text-white shadow-lg shadow-indigo-500/5'
                }`}
            >
              {isExporting ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> กำลังสร้างรายงาน...</>
              ) : (
                <><FileDown className="w-3.5 h-3.5" /> นำออกรายงานสรุป (PDF)</>
              )}
            </button>
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

          {/* Year Filter */}
          <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-5 border border-slate-800 shadow-2xl w-full">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" /> เลือกปี (Year)
              </h4>
              <button 
                onClick={() => setCompareMode(!compareMode)}
                className={`text-[9px] px-3 py-1.5 rounded-lg transition-all border font-bold ${compareMode ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50' : 'bg-transparent text-slate-500 border-slate-700 hover:border-slate-500'}`}
              >
                เปรียบเทียบปี
              </button>
            </div>
            
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-mono">2018</span>
              <span className="text-lg font-bold text-indigo-400 font-mono">{selectedYear}</span>
              <span className="text-xs text-slate-400 font-mono">2026</span>
            </div>
            <input 
              type="range" 
              min="2018" 
              max="2026" 
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 mb-2"
            />

            {compareMode && (
              <div className="mt-4 pt-4 border-t border-slate-800/50">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                    ปีฐานที่ใช้เทียบ (Baseline)
                  </h4>
                  <span className="text-sm font-bold text-indigo-400 font-mono">{compareYear}</span>
                </div>
                <input 
                  type="range" 
                  min="2018" 
                  max="2026" 
                  value={compareYear}
                  onChange={(e) => setCompareYear(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
            )}
          </div>

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

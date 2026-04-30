/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import LSTSidebar from "@/components/gee/LSTSidebar";
import { Layers } from "lucide-react";

// Use dynamic import for Map to prevent SSR issues with Leaflet
const LSTMapView = dynamic(() => import("@/components/gee/LSTMapView"), { ssr: false });

export default function EarthEnginePage() {
  const [activeDistrict, setActiveDistrict] = useState("ทั้งหมด");
  const [selectedYear, setSelectedYear] = useState(2026);
  const [compareMode, setCompareMode] = useState(false);
  const [compareYear, setCompareYear] = useState(2018);
  const [mapMode, setMapMode] = useState<'district' | 'idw'>('idw');
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [invertedMask, setInvertedMask] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [opacity, setOpacity] = useState(0.8);
  const [baseMap, setBaseMap] = useState<'dark' | 'light' | 'satellite' | 'streets'>('dark');

  useEffect(() => {
    setLoading(true);
    // Build query params dynamically
    const params = new URLSearchParams({ 
      year: selectedYear.toString(),
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
    setSelectedYear(2026);
    setCompareMode(false);
    setCompareYear(2018);
    setMapMode('idw');
    setOpacity(0.8);
  };

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden text-slate-50 font-sans">
      <LSTSidebar
        onDistrictSelect={setActiveDistrict}
        activeDistrict={activeDistrict}
        summary={summary}
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
            />
        </div>

        {/* Data Source Badge */}
        <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-700/50 shadow-lg pointer-events-none">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Data Source Information</span>
          </div>
          <div className="text-[11px] text-slate-400 leading-relaxed">
            <p><span className="text-white">Satellite:</span> Landsat 8/9 Collection 2 Level 2</p>
            <p>
              <span className="text-white">Period:</span> Jan 01 - {selectedYear === new Date().getFullYear() 
                ? new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) 
                : 'Dec 31'}, {selectedYear}
              {selectedYear === new Date().getFullYear() ? ' (Year-to-Date)' : ' (Yearly Median)'}
            </p>
            <p><span className="text-white">Resolution:</span> 30m per pixel (Land Surface Temp)</p>
          </div>
        </div>

        {/* Top-right floating panel: Year Slider & Legend */}
        <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-3">
          
          {/* Map Mode Toggle */}
          <div className="bg-[#0f172a]/90 backdrop-blur-md rounded-xl p-3 border border-slate-800 shadow-2xl w-64 flex justify-between items-center">
            <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
              <Layers className="w-3 h-3" /> รูปแบบ (Map Style)
            </h4>
            <button 
              onClick={handleReset}
              className="text-[9px] px-2 py-1 bg-slate-800 text-slate-400 hover:text-white rounded border border-slate-700 hover:border-slate-500 transition-all"
            >
              Reset
            </button>
            <div className="flex bg-slate-800/80 rounded-md p-0.5 ml-2">
              <button
                onClick={() => setMapMode('district')}
                className={`text-[9px] px-2 py-1 rounded transition-colors ${mapMode === 'district' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                รายเขต (Districts)
              </button>
              <button
                onClick={() => setMapMode('idw')}
                className={`text-[9px] px-2 py-1 rounded transition-colors ${mapMode === 'idw' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                ภาพดาวเทียม (GEE)
              </button>
            </div>
          </div>

          {/* Opacity Slider (Only visible in GEE mode) */}
          {mapMode === 'idw' && (
            <div className="bg-[#0f172a]/90 backdrop-blur-md rounded-xl p-3 border border-slate-800 shadow-2xl w-64">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  ความจาง (Layer Opacity)
                </h4>
                <span className="text-[10px] font-mono text-orange-500 font-bold">{Math.round(opacity * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                value={opacity} 
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
            </div>
          )}

          {/* Base Map Selector */}
          <div className="bg-[#0f172a]/90 backdrop-blur-md rounded-xl p-3 border border-slate-800 shadow-2xl w-64">
            <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <Layers className="w-3 h-3" /> แผนที่ฐาน (Base Map)
            </h4>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'dark', label: 'Dark Matter' },
                { id: 'light', label: 'Positron' },
                { id: 'satellite', label: 'Satellite' },
                { id: 'streets', label: 'OpenStreet' }
              ].map((map) => (
                <button
                  key={map.id}
                  onClick={() => setBaseMap(map.id as any)}
                  className={`text-[9px] py-1.5 rounded border transition-all ${
                    baseMap === map.id 
                      ? 'bg-orange-500 border-orange-500 text-white font-bold' 
                      : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {map.label}
                </button>
              ))}
            </div>
          </div>

          {/* Year Filter */}
          <div className="bg-[#0f172a]/90 backdrop-blur-md rounded-xl p-4 border border-slate-800 shadow-2xl w-64">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                <Layers className="w-3 h-3" /> เลือกปี (Year Filter)
              </h4>
              <button 
                onClick={() => setCompareMode(!compareMode)}
                className={`text-[9px] px-2 py-1 rounded transition-colors border ${compareMode ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50' : 'bg-transparent text-slate-400 border-slate-700 hover:border-slate-500'}`}
              >
                เปรียบเทียบปี
              </button>
            </div>
            
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-mono">2018</span>
              <span className="text-lg font-bold text-orange-400 font-mono">{selectedYear}</span>
              <span className="text-xs text-slate-400 font-mono">2026</span>
            </div>
            <input 
              type="range" 
              min="2018" 
              max="2026" 
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 mb-2"
            />

            {compareMode && (
              <div className="mt-4 pt-4 border-t border-slate-800/50">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1">
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
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="bg-[#0f172a]/90 backdrop-blur-md rounded-xl p-4 border border-slate-800 shadow-2xl w-64">
            <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-3">
              {compareMode ? 'สัญลักษณ์การเปลี่ยนแปลง (Anomaly)' : 'อุณหภูมิเฉลี่ยพื้นผิว (Annual Median)'}
            </h4>
            
            {(() => {
              if (compareMode) {
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-[11px] text-slate-300">
                      <span className="w-3 h-3 rounded-full bg-[#B2182B]" /> <span>&gt; +1.5°C (ร้อนขึ้นมาก)</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-300">
                      <span className="w-3 h-3 rounded-full bg-[#EF8A62]" /> <span>+0.5°C ถึง +1.5°C</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-300">
                      <span className="w-3 h-3 rounded-full bg-[#F7F7F7]" /> <span>-0.5°C ถึง +0.5°C (คงที่)</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-300">
                      <span className="w-3 h-3 rounded-full bg-[#67A9CF]" /> <span>-1.5°C ถึง -0.5°C</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-300">
                      <span className="w-3 h-3 rounded-full bg-[#2166AC]" /> <span>&lt; -1.5°C (เย็นลงมาก)</span>
                    </div>
                  </div>
                );
              }

              const min = summary?.min_lst || 30;
              const max = summary?.max_lst || 40;
              const range = max - min;
              const pct80 = (min + range * 0.8).toFixed(1);
              const pct60 = (min + range * 0.6).toFixed(1);
              const pct40 = (min + range * 0.4).toFixed(1);
              const pct20 = (min + range * 0.2).toFixed(1);

              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full bg-[#800026]" /> <span>ร้อนที่สุด (Max)</span>
                    </div>
                    <span className="font-mono text-[9px] text-slate-400">&gt; {pct80}°C</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full bg-[#E31A1C]" /> <span>ร้อนมาก</span>
                    </div>
                    <span className="font-mono text-[9px] text-slate-400">{pct60} - {pct80}°C</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full bg-[#FD8D3C]" /> <span>ร้อน</span>
                    </div>
                    <span className="font-mono text-[9px] text-slate-400">{pct40} - {pct60}°C</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full bg-[#FEB24C]" /> <span>ปานกลาง</span>
                    </div>
                    <span className="font-mono text-[9px] text-slate-400">{pct20} - {pct40}°C</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full bg-[#FFEDA0]" /> <span>เย็นที่สุด (Min)</span>
                    </div>
                    <span className="font-mono text-[9px] text-slate-400">&lt; {pct20}°C</span>
                  </div>
                </div>
              );
            })()}
            
            <div className="mt-4 p-3 bg-slate-900/80 rounded-lg border border-slate-800/80 text-[10px] text-slate-400 leading-relaxed">
              {compareMode 
                ? <><span className="text-indigo-400 font-bold">Temperature Anomaly</span> แสดงส่วนต่างอุณหภูมิเปรียบเทียบระหว่างปีปัจจุบันและปีฐาน สีแดงคือร้อนขึ้น สีฟ้าคือเย็นลง</>
                : <><span className="text-yellow-500 font-bold">LST (Land Surface Temperature)</span> คืออุณหภูมิพื้นผิวที่วัดจากภาพถ่ายดาวเทียม สะท้อนความร้อนที่แผ่ออกจากพื้นดินและอาคาร</>
              }
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/Sidebar";
import { Flame, Layers } from "lucide-react";

const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });

export default function Home() {
  const [activeTag, setActiveTag] = useState("ทั้งหมด");
  const [activeDistrict, setActiveDistrict] = useState("ทั้งหมด");
  const [activeCategory, setActiveCategory] = useState("ทั้งหมด");
  const [activeDistrictGroup, setActiveDistrictGroup] = useState("ทั้งหมด");
  const [traffyData, setTraffyData] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<string>('');
  const [mapMode, setMapMode] = useState<'points' | 'heatmap'>('points');

  useEffect(() => {
    setLoading(true);
    // Build query params dynamically
    const params = new URLSearchParams({ limit: '5000' });
    if (activeDistrict !== 'ทั้งหมด') params.append('district', activeDistrict);
    if (activeCategory !== 'ทั้งหมด') params.append('category', activeCategory);
    if (activeDistrictGroup !== 'ทั้งหมด') params.append('district_group', activeDistrictGroup);

    fetch(`/api/traffy?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        setTraffyData(data.geojson);
        setSummary(data.summary);
        setDataSource(data.source || 'unknown');
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [activeDistrict, activeCategory, activeDistrictGroup]);

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden text-slate-50 font-sans">
      <Sidebar
        onTagSelect={setActiveTag}
        activeTag={activeTag}
        onDistrictSelect={setActiveDistrict}
        activeDistrict={activeDistrict}
        onCategorySelect={setActiveCategory}
        activeCategory={activeCategory}
        onDistrictGroupSelect={setActiveDistrictGroup}
        activeDistrictGroup={activeDistrictGroup}
        traffyData={traffyData}
        summary={summary}
        loading={loading}
      />

      <main className="flex-1 relative">
        <div className="absolute inset-0 z-0">
          <MapView activeTag={activeTag} traffyData={traffyData} mapMode={mapMode} />
        </div>

        {/* Top-right floating panel: Legend + Controls */}
        <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-3">
          
          {/* Map Mode Toggle */}
          <div className="bg-[#0f172a]/90 backdrop-blur-md rounded-xl p-3 border border-slate-800 shadow-2xl">
            <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <Layers className="w-3 h-3" /> โหมดแผนที่
            </h4>
            <div className="flex gap-1.5">
              <button
                onClick={() => setMapMode('points')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  mapMode === 'points'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                ● จุด (Points)
              </button>
              <button
                onClick={() => setMapMode('heatmap')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  mapMode === 'heatmap'
                    ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/30'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                🔥 ความร้อน (Heat)
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="bg-[#0f172a]/90 backdrop-blur-md rounded-xl p-3 border border-slate-800 shadow-2xl w-56">
            <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">สัญลักษณ์ (Legend)</h4>
            {[
              { label: "รอรับเรื่อง", color: "#ef4444", sub: "Waiting" },
              { label: "กำลังดำเนินการ", color: "#eab308", sub: "In Progress" },
              { label: "ส่งต่อ", color: "#f97316", sub: "Forwarded" },
              { label: "เสร็จสิ้น", color: "#22c55e", sub: "Resolved" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 mb-1.5 last:mb-0">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color, boxShadow: `0 0 6px ${item.color}60` }} />
                <span className="text-[11px] text-slate-200">{item.label}</span>
                <span className="text-[9px] text-slate-500">({item.sub})</span>
              </div>
            ))}
          </div>

          {/* Data source badge */}
          <div className="bg-[#0f172a]/90 backdrop-blur-md rounded-xl p-3 border border-slate-800 shadow-2xl text-center">
            <span className="text-[9px] text-slate-500">แสดงข้อมูล</span>
            <div className="text-lg font-black text-indigo-400 leading-tight">
              {summary?.totalFetched?.toLocaleString() || "..."}
              <span className="text-[9px] text-slate-500 font-normal ml-1">
                จุดบนแผนที่
              </span>
            </div>
            <div className="text-xl font-black text-amber-400 leading-tight mt-1">
              {summary?.totalApi?.toLocaleString() || "..."}
              <span className="text-[9px] text-slate-500 font-normal ml-1">
                ข้อมูลในระบบ (charts)
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-800">
              <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                dataSource === 'supabase' 
                  ? 'bg-green-500/20 text-green-400' 
                  : 'bg-amber-500/20 text-amber-400'
              }`}>
                {dataSource === 'supabase' ? '⚡ SUPABASE' : '🌐 LIVE API'}
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

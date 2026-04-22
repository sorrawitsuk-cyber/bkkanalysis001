"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/Sidebar";
import AnalyticsChart from "@/components/charts/AnalyticsChart";
import TimeSlider from "@/components/ui/TimeSlider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Info } from "lucide-react";

// Dynamically import map component due to window/SSR Leaflet constraints
const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });

export default function Home() {
  const [selectedTag, setSelectedTag] = useState("การร้องเรียน"); // Default to new Traffy tag
  const [selectedDistrict, setSelectedDistrict] = useState<any>(null);
  const [selectedYear, setSelectedYear] = useState(2024);

  const availableYears = [2020, 2021, 2022, 2023, 2024];

  const handleTagSelect = (tag: string) => {
    setSelectedTag(tag);
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden text-slate-800 font-sans">
      <Sidebar onTagSelect={handleTagSelect} activeTag={selectedTag} />
      
      <main className="flex-1 relative">
        {/* Floating Map Header */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000] w-fit">
          <div className="bg-white/90 backdrop-blur-md px-6 py-3 rounded-2xl shadow-xl border border-white/20 flex items-center gap-3 ring-1 ring-slate-900/5">
            <div className="bg-indigo-100 p-1.5 rounded-lg text-indigo-600">
              <Info className="h-4 w-4" />
            </div>
            <p className="text-sm font-medium text-slate-700 whitespace-nowrap flex items-center gap-2">
              <span>แผนที่แสดงการวิเคราะห์: <span className="font-bold text-indigo-600">{selectedTag}</span></span>
              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full border border-slate-200">ข้อมูลอัปเดต ณ ปี {selectedYear}</span>
            </p>
          </div>
        </div>

        <div className="absolute inset-0 z-0">
           <MapView 
             onSelectDistrict={(d) => setSelectedDistrict(d)} 
             activeTag={selectedTag} 
             selectedYear={selectedYear} 
           />
        </div>
        
        {/* District Analytics Panel Overlay */}
        {selectedDistrict && (
          <div className="absolute top-6 right-6 z-[1001] w-[420px] animate-in slide-in-from-right-8 duration-300 shadow-2xl">
            <Card className="border-0 bg-white/95 backdrop-blur-md shadow-2xl rounded-2xl overflow-hidden ring-1 ring-slate-900/5 flex flex-col max-h-[90vh]">
              <CardHeader className="bg-indigo-600 px-6 py-4 relative shrink-0">
                <button 
                  onClick={() => setSelectedDistrict(null)}
                  className="absolute right-4 top-4 text-white/70 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
                <CardTitle className="text-white text-xl flex flex-col tracking-tight">
                  {selectedDistrict.name_th}
                  <span className="text-xs font-normal opacity-80 mt-0.5">{selectedDistrict.name_en}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 overflow-y-auto custom-scrollbar flex-1">
                <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                  <div>
                    <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">ประชากร</h4>
                    <p className="text-2xl font-bold text-slate-700 mt-1">{selectedDistrict.population?.toLocaleString()}</p>
                  </div>
                  <div>
                    <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">การร้องเรียน (เรื่อง)</h4>
                    <p className="text-2xl font-bold text-amber-600 mt-1">
                      {selectedDistrict.traffy_issues?.toLocaleString() || 0}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">ความหนาแน่น</h4>
                    <p className="text-2xl font-bold text-slate-700 mt-1">{selectedDistrict.density?.toLocaleString()}</p>
                  </div>
                  <div>
                    <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">อัตราแก้ปัญหา</h4>
                    <p className={`text-2xl font-bold mt-1 ${selectedDistrict.traffy_resolved_rate > 80 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {selectedDistrict.traffy_resolved_rate || 0}%
                    </p>
                  </div>
                </div>
                
                <div className="mt-8 pt-4 border-t border-slate-100">
                   <AnalyticsChart district={selectedDistrict} activeTag={selectedTag} />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <TimeSlider 
          years={availableYears} 
          selectedYear={selectedYear} 
          onChange={setSelectedYear} 
        />
      </main>
    </div>
  );
}

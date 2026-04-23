"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function Sidebar({ onTagSelect, activeTag }: { onTagSelect: (tag: string) => void, activeTag: string }) {
  
  const tags = ["ประชากร", "ความหนาแน่น", "อัตราการเติบโต", "การเข้าถึง", "พื้นที่สีเขียว", "การร้องเรียน"];

  const handleTagClick = (tag: string) => {
    onTagSelect(tag);
  };

  return (
    <div className="w-80 bg-white/80 backdrop-blur-xl border-r border-slate-200/60 p-6 flex flex-col gap-8 shadow-[4px_0_24px_rgb(0,0,0,0.02)] z-10 relative h-full">
      
      {/* Brand */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">Bangkok Analytics</h1>
        <p className="text-sm text-slate-500 mt-1 font-medium">ระบบวิเคราะห์ข้อมูลระดับเขต (50 เขต)</p>
      </div>

      {/* Search */}
      <div className="relative group">
        <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
        <Input 
          placeholder="ค้นหาเขต..." 
          className="pl-10 bg-slate-100/50 border-0 ring-1 ring-inset ring-slate-200 focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl h-10 transition-all text-sm"
        />
      </div>

      {/* Map Layers */}
      <div className="flex-1">
        <h3 className="text-[11px] font-bold text-slate-400 tracking-wider mb-4 uppercase">ชั้นข้อมูลแผนที่ (Map Layers)</h3>
        <div className="flex flex-wrap gap-2.5">
          {tags.map(tag => (
            <Badge 
              key={tag}
              variant={activeTag === tag ? "default" : "secondary"}
              className={`cursor-pointer px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-300 ${
                activeTag === tag 
                  ? 'bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 scale-105' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
              onClick={() => handleTagClick(tag)}
            >
              #{tag}
            </Badge>
          ))}
        </div>
      </div>

      <div className="mt-auto">
        <p className="text-[10px] text-slate-400 font-medium">แหล่งข้อมูล: BMA Open Data, Google Earth Engine</p>
      </div>
    </div>
  );
}

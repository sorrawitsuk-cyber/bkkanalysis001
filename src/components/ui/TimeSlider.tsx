"use client";

import { useState, useEffect } from "react";
import { Play, Pause } from "lucide-react";

interface TimeSliderProps {
  years: number[];
  selectedYear: number;
  onChange: (year: number) => void;
}

export default function TimeSlider({ years, selectedYear, onChange }: TimeSliderProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        const currentIndex = years.indexOf(selectedYear);
        const nextIndex = (currentIndex + 1) % years.length;
        onChange(years[nextIndex]);
        if (nextIndex === years.length - 1) {
          setIsPlaying(false); // Stop at the end
        }
      }, 1500); // 1.5 seconds per year
    }
    return () => clearInterval(interval);
  }, [isPlaying, selectedYear, years, onChange]);

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-[600px] max-w-[90vw]">
      <div className="bg-white/95 backdrop-blur-md px-6 py-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-200/60 ring-1 ring-slate-900/5">
        
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all shadow-md shadow-indigo-200"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 ml-1 fill-current" />}
            </button>
            <div>
              <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">การเปลี่ยนแปลงตามเวลา</span>
              <div className="text-xl font-black text-indigo-900 leading-none">{selectedYear}</div>
            </div>
          </div>
        </div>

        <div className="relative pt-2 pb-1">
          {/* Track line */}
          <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div 
              className="absolute top-0 bottom-0 left-0 bg-indigo-500 transition-all duration-300 ease-out"
              style={{ width: `${((selectedYear - years[0]) / (years[years.length - 1] - years[0])) * 100}%` }}
            />
          </div>

          {/* Markers */}
          <div className="relative flex justify-between w-full">
            {years.map((year) => {
              const isSelected = year === selectedYear;
              const isPast = year < selectedYear;
              
              return (
                <div key={year} className="flex flex-col items-center group relative z-10">
                  <button
                    onClick={() => { setIsPlaying(false); onChange(year); }}
                    className={`
                      w-4 h-4 rounded-full border-2 bg-white transition-all duration-200
                      ${isSelected 
                        ? 'border-indigo-600 ring-4 ring-indigo-100 scale-125' 
                        : isPast 
                          ? 'border-indigo-400 hover:border-indigo-500' 
                          : 'border-slate-300 hover:border-slate-400'
                      }
                    `}
                  />
                  <span className={`
                    absolute top-6 text-xs font-medium transition-colors whitespace-nowrap
                    ${isSelected ? 'text-indigo-700 font-bold' : 'text-slate-400 group-hover:text-slate-600'}
                  `}>
                    {year}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}

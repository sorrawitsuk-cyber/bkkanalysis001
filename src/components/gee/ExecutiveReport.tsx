import React from 'react';
import { ThermometerSun, MapPin, Calendar, Activity } from 'lucide-react';

interface ExecutiveReportProps {
  summary: any;
  activeDistrict: string;
  compareMode: boolean;
  compareYear: number;
  mapSnapshot?: string | null;
  mapMode?: string;
}

export default function ExecutiveReport({ summary, activeDistrict, compareMode, compareYear, mapSnapshot, mapMode }: ExecutiveReportProps) {
  if (!summary) return null;

  const currentDate = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Derived values
  const avgTemp = summary.averageTemp;
  const maxTemp = summary.maxTemp;
  const delta = summary.avgDelta;
  const ranking = summary.ranking || [];
  const top10 = ranking.slice(0, 10);
  
  // Dynamic Explanation Text
  const renderExplanation = () => {
    if (compareMode) {
      return (
        <p className="text-sm text-gray-700 leading-relaxed">
          รายงานฉบับนี้แสดงผลการเปรียบเทียบอุณหภูมิพื้นผิว (LST) ระหว่างปี <strong>{compareYear}</strong> (ปีฐาน) และ <strong>{summary.selectedYear}</strong> 
          สำหรับพื้นที่ <strong>{activeDistrict}</strong> พบว่าอุณหภูมิเฉลี่ยมีการเปลี่ยนแปลง 
          <strong className={delta > 0 ? 'text-red-600 ml-1' : 'text-blue-600 ml-1'}>
            {delta > 0 ? `เพิ่มขึ้น ${delta.toFixed(2)}°C` : `ลดลง ${Math.abs(delta).toFixed(2)}°C`}
          </strong>
          เมื่อเทียบกับปีฐาน เขตที่มีอุณหภูมิพุ่งสูงที่สุด 3 อันดับแรกคือ {top10.slice(0,3).map((d:any) => d[0]).join(', ')} 
          ซึ่งอาจเป็นผลมาจากการพัฒนาโครงสร้างพื้นฐาน การเพิ่มขึ้นของพื้นที่สิ่งปลูกสร้าง หรือการลดลงของพื้นที่สีเขียว
        </p>
      );
    } else {
      return (
        <p className="text-sm text-gray-700 leading-relaxed">
          รายงานฉบับนี้แสดงสถานการณ์เกาะความร้อนเมือง (Urban Heat Island) ประจำปี <strong>{summary.selectedYear}</strong> 
          สำหรับพื้นที่ <strong>{activeDistrict}</strong> พบว่าอุณหภูมิพื้นผิวเฉลี่ย (Median LST) อยู่ที่ <strong>{avgTemp}°C</strong> 
          และมีอุณหภูมิสูงสุดที่ตรวจพบในพื้นที่ถึง <strong>{maxTemp}°C</strong> 
          เขตที่สะสมความร้อนสูงสุด 3 อันดับแรกคือ {top10.slice(0,3).map((d:any) => d[0]).join(', ')} 
          ข้อมูลนี้สะท้อนถึงการสะสมความร้อนในเขตเมืองหนาแน่น ซึ่งส่งผลกระทบต่อสภาพแวดล้อมและการใช้พลังงานในพื้นที่
        </p>
      );
    }
  };

  return (
    // Landscape A4 aspect ratio (297x210mm). Approx 1123x794 pixels.
    <div 
      id="executive-report" 
      className="bg-slate-50 text-slate-900 absolute top-0 left-[-9999px] z-[-1] flex"
      style={{ width: '1123px', height: '794px' }}
    >
      {/* Left Sidebar (Data & Charts) */}
      <div className="w-[450px] h-full bg-white border-r-2 border-slate-200 p-8 flex flex-col shadow-2xl relative z-10">
      {/* Header */}
      <div className="border-b-2 border-slate-900 pb-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">
          รายงานสรุปสถานการณ์เกาะความร้อนเมือง (Executive Summary)
        </h1>
        <div className="flex justify-between items-end">
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-widest">
            Bangkok Urban Heat Island Analytics
          </h2>
          <div className="text-xs text-slate-500 text-right">
            <div>วันที่ออกรายงาน: {currentDate}</div>
            <div>พื้นที่วิเคราะห์: {activeDistrict}</div>
          </div>
        </div>
      </div>

      {/* Overview Metrics */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-800 mb-2 border-l-4 border-slate-900 pl-2">ภาพรวม (Overview)</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <div className="text-xs font-bold text-slate-500 uppercase mb-1">ปีที่วิเคราะห์</div>
            <div className="text-2xl font-black text-slate-800">
              {compareMode ? `${compareYear} vs ${summary.selectedYear}` : summary.selectedYear}
            </div>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
            <div className="text-xs font-bold text-orange-600 uppercase mb-1 flex items-center gap-1">
              <ThermometerSun className="w-3 h-3" /> อุณหภูมิเฉลี่ย (Mean)
            </div>
            <div className="text-2xl font-black text-orange-600">
              {avgTemp}°C
            </div>
          </div>
          {compareMode ? (
            <div className={`${delta > 0 ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'} p-4 rounded-lg border`}>
              <div className={`text-xs font-bold ${delta > 0 ? 'text-red-600' : 'text-blue-600'} uppercase mb-1 flex items-center gap-1`}>
                <Activity className="w-3 h-3" /> ส่วนต่าง (Delta)
              </div>
              <div className={`text-2xl font-black ${delta > 0 ? 'text-red-600' : 'text-blue-600'}`}>
                {delta > 0 ? '+' : ''}{delta.toFixed(2)}°C
              </div>
            </div>
          ) : (
             <div className="bg-red-50 p-4 rounded-lg border border-red-100">
              <div className="text-xs font-bold text-red-600 uppercase mb-1 flex items-center gap-1">
                <ThermometerSun className="w-3 h-3" /> ร้อนสูงสุด (Max)
              </div>
              <div className="text-2xl font-black text-red-600">
                {maxTemp}°C
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Explanation */}
      <div className="mb-6 bg-slate-50 p-4 rounded-lg border border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 mb-2">บทสรุปผู้บริหาร (Executive Insight)</h3>
        {renderExplanation()}
      </div>

      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Rankings */}
        <div className="flex-1 bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-slate-800 mb-2 border-l-4 border-slate-900 pl-2">
            {compareMode ? '10 อันดับเขตที่ความร้อนพุ่งสูง' : '10 อันดับเขตที่ร้อนที่สุด'}
          </h3>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="text-left py-1 text-slate-500 font-bold">อันดับ</th>
                <th className="text-left py-1 text-slate-500 font-bold">เขต</th>
                <th className="text-right py-1 text-slate-500 font-bold">
                  {compareMode ? 'ส่วนต่าง' : 'อุณหภูมิ (°C)'}
                </th>
              </tr>
            </thead>
            <tbody>
              {top10.slice(0, 5).map(([dist, val]: any, idx: number) => (
                <tr key={dist} className="border-b border-slate-100">
                  <td className="py-1 text-slate-500 font-mono">{idx + 1}</td>
                  <td className="py-1 font-medium">{dist}</td>
                  <td className="py-1 text-right font-mono font-bold text-slate-700">
                    {compareMode ? (val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2)) : val.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[8px] text-slate-400 mt-1 italic">* แสดงเพียง 5 อันดับแรกเพื่อความกระชับ</div>
        </div>

        {/* Trends */}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-slate-800 mb-2 border-l-4 border-slate-900 pl-2">แนวโน้มอุณหภูมิ</h3>
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="text-[9px] text-slate-500 mb-1 text-center">รายเดือน</div>
              <div className="flex items-end gap-0.5 h-16 border-b border-l border-slate-300 pb-1 pl-1">
                {summary.monthlyTrend.map((temp: number, i: number) => {
                      const currentYear = new Date().getFullYear();
                      const currentMonth = new Date().getMonth();
                      const isFutureMonth = summary.selectedYear === currentYear && i > currentMonth;
                      const pct = Math.max(0, Math.min(100, ((temp - 30) / 10) * 100));
                      
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                          {!isFutureMonth ? (
                            <div className="w-full bg-orange-500 rounded-t-sm" style={{ height: `${pct}%` }} />
                          ) : (
                            <div className="w-full bg-slate-200 h-[2px]" />
                          )}
                        </div>
                      );
                })}
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[9px] text-slate-500 mb-1 text-center">รายปี</div>
              <div className="flex items-end gap-0.5 h-16 border-b border-l border-slate-300 pb-1 pl-1">
                {summary.yearlyTrend.map((item: any, i: number) => {
                    const temp = item[1];
                    const pct = Math.max(0, Math.min(100, ((temp - 34) / 6) * 100));
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                        <div className="w-full bg-slate-700 rounded-t-sm" style={{ height: `${pct}%` }} />
                      </div>
                    );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      </div>

      {/* Right Content Area (Map Snapshot) */}
      <div className="flex-1 h-full relative bg-slate-900 overflow-hidden">
        {mapSnapshot ? (
          <img src={mapSnapshot} alt="Map Capture" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
            <MapPin className="w-16 h-16 mb-4 opacity-50" />
            <p>ไม่สามารถจับภาพแผนที่ได้ (Map Snapshot Unavailable)</p>
          </div>
        )}
        
        {/* Mode Overlay on Map */}
        <div className="absolute top-8 left-8 bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-slate-700 shadow-xl max-w-sm">
          <div className="text-[12px] text-slate-300">
            <div><strong>โหมดการแสดงผล:</strong> {mapMode === 'idw' ? 'ภาพถ่ายดาวเทียมความละเอียดสูง (GEE)' : 'ระดับเขตปกครอง (Districts)'}</div>
          </div>
        </div>

        {/* Legend Overlay on Map */}
        <div className="absolute bottom-8 right-8 bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-slate-700 shadow-xl w-64">
           <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">
              {compareMode ? 'สัญลักษณ์การเปลี่ยนแปลง' : 'สัญลักษณ์ระดับความร้อน'}
           </h4>
           {compareMode ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-[10px] text-slate-300"><span className="w-3 h-3 rounded-full bg-[#B2182B]" /> <span>&gt; +1.5°C (ร้อนขึ้นมาก)</span></div>
                <div className="flex items-center gap-3 text-[10px] text-slate-300"><span className="w-3 h-3 rounded-full bg-[#EF8A62]" /> <span>+0.5°C ถึง +1.5°C</span></div>
                <div className="flex items-center gap-3 text-[10px] text-slate-300"><span className="w-3 h-3 rounded-full bg-[#F7F7F7]" /> <span>-0.5°C ถึง +0.5°C (คงที่)</span></div>
                <div className="flex items-center gap-3 text-[10px] text-slate-300"><span className="w-3 h-3 rounded-full bg-[#67A9CF]" /> <span>-1.5°C ถึง -0.5°C</span></div>
                <div className="flex items-center gap-3 text-[10px] text-slate-300"><span className="w-3 h-3 rounded-full bg-[#2166AC]" /> <span>&lt; -1.5°C (เย็นลงมาก)</span></div>
              </div>
           ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-[10px] text-slate-300"><span className="w-3 h-3 rounded-full bg-[#800026]" /> <span>ร้อนที่สุด (Max)</span></div>
                <div className="flex items-center gap-3 text-[10px] text-slate-300"><span className="w-3 h-3 rounded-full bg-[#E31A1C]" /> <span>ร้อนมาก</span></div>
                <div className="flex items-center gap-3 text-[10px] text-slate-300"><span className="w-3 h-3 rounded-full bg-[#FD8D3C]" /> <span>ร้อน</span></div>
                <div className="flex items-center gap-3 text-[10px] text-slate-300"><span className="w-3 h-3 rounded-full bg-[#FEB24C]" /> <span>ปานกลาง</span></div>
                <div className="flex items-center gap-3 text-[10px] text-slate-300"><span className="w-3 h-3 rounded-full bg-[#FFEDA0]" /> <span>เย็นที่สุด (Min)</span></div>
              </div>
           )}
        </div>
      </div>


      {/* Footer Info placed at the bottom of the map via absolute positioning, so we don't need the old footer block here. Actually wait, let's keep it inside the map area */}

    </div>
  );
}

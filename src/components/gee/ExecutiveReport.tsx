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
  const top10 = ranking.slice(0, 8);
  const baselineAvg = summary.baselineAverageTemp;
  const maxIncreaseValue = summary.maxIncreaseDelta ?? summary.max_delta ?? 0;
  const monthlyReportTrend = compareMode && summary.monthlyDeltaTrend?.length
    ? summary.monthlyDeltaTrend
    : (summary.monthlyTrend || []);
  const yearlyReportTrend = compareMode && summary.yearlyDeltaTrend?.length
    ? summary.yearlyDeltaTrend
    : (summary.yearlyTrend || []);
  const topDistricts = top10.slice(0, 3).map((d: any) => d[0]).join(', ');
  const insightText = compareMode
    ? `Compared with ${compareYear}, ${activeDistrict} changed by ${delta > 0 ? '+' : ''}${delta.toFixed(2)}°C on average. The largest district increase in this selection is ${maxIncreaseValue > 0 ? '+' : ''}${maxIncreaseValue.toFixed(2)}°C. Top increase areas: ${topDistricts}.`
    : `In ${summary.selectedYear}, ${activeDistrict} has an average LST of ${avgTemp}°C and a maximum observed value of ${maxTemp}°C. Top heat accumulation areas: ${topDistricts}.`;
  
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
    // Portrait A4 aspect ratio (210x297mm). Approx 794x1123 pixels.
    <div 
      id="executive-report" 
      className="bg-white text-slate-900 absolute top-0 left-[-9999px] z-[-1] flex flex-col overflow-hidden"
      style={{ width: '794px', height: '1123px', padding: '28px' }}
    >
      {/* Header */}
      <div className="border-b-2 border-slate-900 pb-3 mb-4">
        <h1 className="text-xl font-bold text-slate-900 mb-1 leading-tight">
          รายงานสรุปสถานการณ์เกาะความร้อนเมือง (Executive Summary)
        </h1>
        <div className="flex justify-between items-end">
          <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-widest">
            Bangkok Urban Heat Island Analytics
          </h2>
          <div className="text-[10px] text-slate-500 text-right leading-tight">
            <div>วันที่ออกรายงาน: {currentDate}</div>
            <div>พื้นที่วิเคราะห์: {activeDistrict}</div>
          </div>
        </div>
      </div>

      {/* Overview Metrics */}
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-800 mb-2 border-l-4 border-slate-900 pl-2">ภาพรวม (Overview)</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="text-xs font-bold text-slate-500 uppercase mb-1">ปีที่วิเคราะห์</div>
            <div className="text-xl font-black text-slate-800">
              {compareMode ? `${compareYear} vs ${summary.selectedYear}` : summary.selectedYear}
            </div>
          </div>
          <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
            <div className="text-xs font-bold text-orange-600 uppercase mb-1 flex items-center gap-1">
              <ThermometerSun className="w-3 h-3" /> อุณหภูมิเฉลี่ย (Mean)
            </div>
            <div className="text-xl font-black text-orange-600">
              {avgTemp}°C
            </div>
          </div>
          {compareMode ? (
            <div className={`${delta > 0 ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'} p-3 rounded-lg border`}>
              <div className={`text-xs font-bold ${delta > 0 ? 'text-red-600' : 'text-blue-600'} uppercase mb-1 flex items-center gap-1`}>
                <Activity className="w-3 h-3" /> ส่วนต่าง (Delta)
              </div>
              <div className={`text-xl font-black ${delta > 0 ? 'text-red-600' : 'text-blue-600'}`}>
                {delta > 0 ? '+' : ''}{delta.toFixed(2)}°C
              </div>
            </div>
          ) : (
             <div className="bg-red-50 p-3 rounded-lg border border-red-100">
              <div className="text-xs font-bold text-red-600 uppercase mb-1 flex items-center gap-1">
                <ThermometerSun className="w-3 h-3" /> ร้อนสูงสุด (Max)
              </div>
              <div className="text-xl font-black text-red-600">
                {maxTemp}°C
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Explanation */}
      <div className="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 mb-2">บทสรุปผู้บริหาร (Executive Insight)</h3>
        <p className="text-xs text-gray-700 leading-snug">{insightText}</p>
      </div>

      {/* Map Inset */}
      <div className="w-full h-[300px] rounded-xl overflow-hidden relative mb-5 border border-slate-300 shadow-md bg-slate-900">
        {mapSnapshot ? (
          <img src={mapSnapshot} alt="Map Capture" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
            <MapPin className="w-12 h-12 mb-2 opacity-50" />
            <p className="text-xs">ไม่สามารถจับภาพแผนที่ได้</p>
          </div>
        )}

        {/* GIS Element: North Arrow */}
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm p-1.5 rounded-md shadow-sm border border-slate-200 flex flex-col items-center text-slate-800">
           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
             <polygon points="12 2 16 22 12 17 8 22 12 2" fill="currentColor" />
           </svg>
           <span className="text-[8px] font-black mt-0.5">N</span>
        </div>

        {/* GIS Element: Coordinates */}
        <div className="absolute top-3 left-3 text-[9px] font-mono font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
           14°00'N, 100°15'E
        </div>
        <div className="absolute bottom-3 right-3 text-[9px] font-mono font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
           13°30'N, 100°55'E
        </div>

        {/* Mode Tag */}
        <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur-md px-2 py-1 rounded text-white text-[8px] font-mono">
           {mapMode === 'idw' ? 'GEE Satellite Mode' : 'District Bounds Mode'}
        </div>

        {/* GIS Element: Scale Bar */}
        <div className="absolute bottom-10 left-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded shadow-sm border border-slate-200 text-[9px] font-mono flex items-center gap-1.5 text-slate-800">
           <div className="w-12 h-[3px] bg-slate-800 relative">
              <div className="absolute top-[-2px] left-0 w-[1px] h-2 bg-slate-800"></div>
              <div className="absolute top-[-2px] right-0 w-[1px] h-2 bg-slate-800"></div>
           </div>
           <strong>10 km</strong>
        </div>

        {/* Legend */}
        <div className="absolute top-4 right-16 bg-slate-900/80 backdrop-blur-md p-2.5 rounded-lg border border-slate-700 shadow-xl max-w-[150px]">
           <h4 className="text-[8px] font-bold text-slate-300 uppercase tracking-widest mb-2 border-b border-slate-700 pb-1">
              {compareMode ? 'สัญลักษณ์การเปลี่ยนแปลง' : 'สัญลักษณ์ระดับความร้อน'}
           </h4>
           {compareMode ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[8px] text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-[#B2182B]" /> <span>&gt; +1.5°C</span></div>
                <div className="flex items-center gap-2 text-[8px] text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-[#EF8A62]" /> <span>+0.5°C ถึง +1.5°C</span></div>
                <div className="flex items-center gap-2 text-[8px] text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-[#F7F7F7]" /> <span>คงที่</span></div>
                <div className="flex items-center gap-2 text-[8px] text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-[#67A9CF]" /> <span>-1.5°C ถึง -0.5°C</span></div>
                <div className="flex items-center gap-2 text-[8px] text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-[#2166AC]" /> <span>&lt; -1.5°C</span></div>
              </div>
           ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[8px] text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-[#800026]" /> <span>ร้อนที่สุด</span></div>
                <div className="flex items-center gap-2 text-[8px] text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-[#E31A1C]" /> <span>ร้อนมาก</span></div>
                <div className="flex items-center gap-2 text-[8px] text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-[#FD8D3C]" /> <span>ร้อน</span></div>
                <div className="flex items-center gap-2 text-[8px] text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-[#FEB24C]" /> <span>ปานกลาง</span></div>
                <div className="flex items-center gap-2 text-[8px] text-slate-300"><span className="w-2.5 h-2.5 rounded-full bg-[#FFEDA0]" /> <span>เย็นที่สุด</span></div>
              </div>
           )}
        </div>
      </div>

      {/* Rankings and Trends - Side by Side */}
      <div className="flex gap-5 flex-1 min-h-0 overflow-hidden">
        {/* Rankings */}
        <div className="flex-[4] flex flex-col min-w-0">
          <h3 className="text-sm font-bold text-slate-800 mb-3 border-l-4 border-slate-900 pl-2">
            {compareMode ? '10 อันดับเขตที่ความร้อนพุ่งสูง' : '10 อันดับเขตที่ร้อนที่สุด'}
          </h3>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="text-left py-2 text-slate-500 font-bold w-12">อันดับ</th>
                <th className="text-left py-2 text-slate-500 font-bold">เขต</th>
                <th className="text-right py-2 text-slate-500 font-bold">
                  {compareMode ? 'ส่วนต่าง' : 'อุณหภูมิ (°C)'}
                </th>
              </tr>
            </thead>
            <tbody>
              {top10.map(([dist, val]: any, idx: number) => (
                <tr key={dist} className="border-b border-slate-100">
                  <td className="py-1.5 text-slate-500 font-mono">{idx + 1}</td>
                  <td className="py-1.5 font-medium">{dist}</td>
                  <td className="py-1.5 text-right font-mono font-bold text-slate-700">
                    {compareMode ? (val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2)) : val.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Trends */}
        <div className="flex-[6] flex flex-col border-l border-slate-200 pl-5 min-w-0">
          <h3 className="text-sm font-bold text-slate-800 mb-4 border-l-4 border-slate-900 pl-2">แนวโน้มอุณหภูมิ</h3>
          <div className="flex flex-col gap-4 flex-1 justify-center">
            {/* Monthly Trend */}
            <div>
              <div className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">แนวโน้มรายเดือน (Monthly)</div>
              <div className="flex items-end gap-1 h-16 border-b border-l border-slate-300 pb-1 pl-1">
                {monthlyReportTrend.map((temp: number, i: number) => {
                      const currentYear = new Date().getFullYear();
                      const currentMonth = new Date().getMonth();
                      const isFutureMonth = summary.selectedYear === currentYear && i > currentMonth;
                      const pct = compareMode
                        ? Math.max(4, Math.min(100, (Math.abs(temp) / 3) * 100))
                        : Math.max(0, Math.min(100, ((temp - 30) / 10) * 100));
                      const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
                      
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                          {!isFutureMonth ? (
                            <>
                              <div className="text-[8px] text-slate-500 font-mono mb-1">{temp}</div>
                              <div className={`w-full ${compareMode ? (temp >= 0 ? 'bg-red-500' : 'bg-blue-500') : 'bg-orange-500'} rounded-t-sm`} style={{ height: `${pct}%` }} />
                            </>
                          ) : (
                            <div className="w-full bg-slate-200 h-[2px]" />
                          )}
                          <div className="text-[8px] text-slate-600 mt-1">{months[i]}</div>
                        </div>
                      );
                })}
              </div>
            </div>
            
            {/* Yearly Trend */}
            <div>
              <div className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">แนวโน้มรายปี (Yearly)</div>
              <div className="flex items-end gap-1.5 h-16 border-b border-l border-slate-300 pb-1 pl-1">
                {yearlyReportTrend.map((item: any, i: number) => {
                    const year = item[0];
                    const temp = item[1];
                    const pct = compareMode
                      ? Math.max(4, Math.min(100, (Math.abs(temp) / 3) * 100))
                      : Math.max(0, Math.min(100, ((temp - 34) / 6) * 100));
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                         <div className="text-[8px] text-slate-500 font-mono mb-1">{temp.toFixed(1)}</div>
                         <div className={`w-full ${compareMode ? (temp >= 0 ? 'bg-red-600' : 'bg-blue-600') : 'bg-slate-700'} rounded-t-sm`} style={{ height: `${pct}%` }} />
                         <div className="text-[8px] text-slate-600 mt-1">{year.toString().slice(-2)}</div>
                      </div>
                    );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

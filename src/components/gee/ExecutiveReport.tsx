import React from 'react';
import { ThermometerSun, MapPin, Calendar, Activity } from 'lucide-react';

interface ExecutiveReportProps {
  summary: any;
  activeDistrict: string;
  compareMode: boolean;
  compareYear: number;
}

export default function ExecutiveReport({ summary, activeDistrict, compareMode, compareYear }: ExecutiveReportProps) {
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
    // The container matches A4 aspect ratio (210x297mm). Approx 794x1123 pixels.
    <div 
      id="executive-report" 
      className="bg-white text-slate-900 absolute top-0 left-[-9999px] z-[-1]"
      style={{ width: '794px', minHeight: '1123px', padding: '40px' }}
    >
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
      <div className="mb-8 bg-slate-50 p-4 rounded-lg border border-slate-200">
        <h3 className="text-sm font-bold text-slate-800 mb-2">บทสรุปผู้บริหาร (Executive Insight)</h3>
        {renderExplanation()}
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* Left Column: Rankings */}
        <div>
          <h3 className="text-lg font-bold text-slate-800 mb-3 border-l-4 border-slate-900 pl-2">
            {compareMode ? '10 อันดับเขตที่ความร้อนพุ่งสูง' : '10 อันดับเขตที่ร้อนที่สุด'}
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="text-left py-2 text-slate-500 font-bold">อันดับ</th>
                <th className="text-left py-2 text-slate-500 font-bold">เขต</th>
                <th className="text-right py-2 text-slate-500 font-bold">
                  {compareMode ? 'ส่วนต่าง' : 'อุณหภูมิ (°C)'}
                </th>
              </tr>
            </thead>
            <tbody>
              {top10.map(([dist, val]: any, idx: number) => (
                <tr key={dist} className="border-b border-slate-100">
                  <td className="py-2 text-slate-500 font-mono">{idx + 1}</td>
                  <td className="py-2 font-medium">{dist}</td>
                  <td className="py-2 text-right font-mono font-bold text-slate-700">
                    {compareMode ? (val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2)) : val.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right Column: Trends */}
        <div>
          <h3 className="text-lg font-bold text-slate-800 mb-3 border-l-4 border-slate-900 pl-2">แนวโน้มรายเดือน</h3>
          <div className="flex items-end gap-1 h-32 mb-4 border-b border-l border-slate-300 pb-1 pl-1">
             {summary.monthlyTrend.map((temp: number, i: number) => {
                  const currentYear = new Date().getFullYear();
                  const currentMonth = new Date().getMonth();
                  const isFutureMonth = summary.selectedYear === currentYear && i > currentMonth;
                  
                  const pct = Math.max(0, Math.min(100, ((temp - 30) / 10) * 100));
                  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
                  
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                       {!isFutureMonth ? (
                        <>
                           <div className="text-[8px] text-slate-500 font-mono mb-1">{temp}</div>
                           <div className="w-full bg-orange-500 rounded-t-sm" style={{ height: `${pct}%` }} />
                        </>
                       ) : (
                          <div className="w-full bg-slate-200 h-1" />
                       )}
                       <div className="text-[9px] text-slate-600 mt-1">{months[i]}</div>
                    </div>
                  );
             })}
          </div>

          <h3 className="text-lg font-bold text-slate-800 mb-3 border-l-4 border-slate-900 pl-2 mt-8">แนวโน้มรายปี</h3>
          <div className="flex items-end gap-1 h-32 border-b border-l border-slate-300 pb-1 pl-1">
             {summary.yearlyTrend.map((item: any, i: number) => {
                const year = item[0];
                const temp = item[1];
                const pct = Math.max(0, Math.min(100, ((temp - 34) / 6) * 100));
                
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                     <div className="text-[8px] text-slate-500 font-mono mb-1">{temp}</div>
                     <div className="w-full bg-slate-700 rounded-t-sm" style={{ height: `${pct}%` }} />
                     <div className="text-[9px] text-slate-600 mt-1">{year.toString().slice(-2)}</div>
                  </div>
                );
             })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-8 left-10 right-10 border-t border-slate-300 pt-4 flex justify-between text-xs text-slate-500">
        <div>
          <strong>ข้อมูลภาพถ่ายดาวเทียม:</strong> Landsat 8/9 Collection 2 Level 2 (Google Earth Engine)
        </div>
        <div>
          <strong>สร้างโดย:</strong> BKK Heat Analytics Dashboard
        </div>
      </div>
    </div>
  );
}

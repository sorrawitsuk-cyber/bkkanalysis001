import { Activity, MapPin, ThermometerSun } from 'lucide-react';

interface ExecutiveReportProps {
  summary: any;
  activeDistrict: string;
  compareMode: boolean;
  compareYear: number;
  mapSnapshot?: string | null;
  mapMode?: string;
}

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export default function ExecutiveReport({ summary, activeDistrict, compareMode, compareYear, mapSnapshot, mapMode }: ExecutiveReportProps) {
  if (!summary) return null;

  const currentDate = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const avgTemp = summary.averageTemp || 0;
  const maxTemp = summary.maxTemp || 0;
  const delta = summary.avgDelta || 0;
  const baselineAvg = summary.baselineAverageTemp || 0;
  const ranking = summary.ranking || [];
  const top10 = ranking.slice(0, 10);
  const topDistricts = top10.slice(0, 3).map((d: any) => d[0]).join(', ');
  const maxIncreaseValue = summary.maxIncreaseDelta ?? summary.max_delta ?? 0;
  const monthlyTrend = summary.monthlyTrend || [];
  const baselineMonthlyTrend = summary.baselineMonthlyTrend || [];
  const yearlyTrend = summary.yearlyTrend || [];

  const monthlyScaleValues = compareMode
    ? [...monthlyTrend, ...baselineMonthlyTrend].filter((value: number) => value > 0)
    : monthlyTrend;
  const monthlyMin = Math.floor(Math.min(30, ...monthlyScaleValues) - 1);
  const monthlyMax = Math.ceil(Math.max(40, ...monthlyScaleValues) + 1);
  const yearlyMin = Math.floor(Math.min(30, baselineAvg || avgTemp, avgTemp) - 1);
  const yearlyMax = Math.ceil(Math.max(40, baselineAvg || avgTemp, avgTemp) + 1);

  const barPct = (value: number, min: number, max: number) =>
    Math.max(4, Math.min(100, ((value - min) / Math.max(1, max - min)) * 100));

  const insightText = compareMode
    ? `เมื่อเทียบกับปี ${compareYear} พื้นที่ ${activeDistrict} มีอุณหภูมิพื้นผิวเฉลี่ยสูงขึ้น ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}°C หมายความว่าโดยรวมพื้นที่นี้ร้อนขึ้นจากปีฐาน เขตที่เพิ่มขึ้นมากที่สุดเพิ่ม ${maxIncreaseValue >= 0 ? '+' : ''}${maxIncreaseValue.toFixed(2)}°C พื้นที่ที่ควรติดตามเป็นพิเศษคือ ${topDistricts}`
    : `ปี ${summary.selectedYear} พื้นที่ ${activeDistrict} มีอุณหภูมิพื้นผิวเฉลี่ย ${avgTemp.toFixed(2)}°C และค่าสูงสุด ${maxTemp.toFixed(2)}°C พื้นที่ที่ร้อนเด่นและควรติดตาม ได้แก่ ${topDistricts}`;

  return (
    <div
      id="executive-report"
      className="bg-white text-slate-900 absolute top-0 left-[-9999px] z-[-1] flex flex-col overflow-hidden"
      style={{ width: '794px', height: '1123px', padding: '28px' }}
    >
      <div className="border-b-2 border-slate-900 pb-3 mb-4">
        <h1 className="text-xl font-bold text-slate-900 mb-1 leading-tight">
          รายงานสรุปสถานการณ์เกาะความร้อนเมือง (Executive Summary)
        </h1>
        <div className="flex justify-between items-end gap-4">
          <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-widest">
            Bangkok Urban Heat Island Analytics
          </h2>
          <div className="text-[10px] text-slate-500 text-right leading-tight shrink-0">
            <div>วันที่ออกรายงาน: {currentDate}</div>
            <div>พื้นที่วิเคราะห์: {activeDistrict}</div>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <h3 className="text-base font-bold text-slate-800 mb-2 border-l-4 border-slate-900 pl-2">ภาพรวม (Overview)</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">ปีที่วิเคราะห์</div>
            <div className="text-xl font-black text-slate-800">
              {compareMode ? `${compareYear} vs ${summary.selectedYear}` : summary.selectedYear}
            </div>
          </div>
          <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
            <div className="text-[10px] font-bold text-orange-600 uppercase mb-1 flex items-center gap-1">
              <ThermometerSun className="w-3 h-3" /> ค่าเฉลี่ยปัจจุบัน
            </div>
            <div className="text-xl font-black text-orange-600">{avgTemp.toFixed(2)}°C</div>
            {compareMode && <div className="text-[9px] text-slate-500 mt-1">ปีฐาน: {baselineAvg.toFixed(2)}°C</div>}
          </div>
          {compareMode ? (
            <div className={`${delta >= 0 ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'} p-3 rounded-lg border`}>
              <div className={`text-[10px] font-bold ${delta >= 0 ? 'text-red-600' : 'text-blue-600'} uppercase mb-1 flex items-center gap-1`}>
                <Activity className="w-3 h-3" /> ส่วนต่างเฉลี่ย
              </div>
              <div className={`text-xl font-black ${delta >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
                {delta >= 0 ? '+' : ''}{delta.toFixed(2)}°C
              </div>
            </div>
          ) : (
            <div className="bg-red-50 p-3 rounded-lg border border-red-100">
              <div className="text-[10px] font-bold text-red-600 uppercase mb-1 flex items-center gap-1">
                <ThermometerSun className="w-3 h-3" /> ร้อนสูงสุด
              </div>
              <div className="text-xl font-black text-red-600">{maxTemp.toFixed(2)}°C</div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
        <h3 className="text-xs font-bold text-slate-800 mb-1.5">บทสรุปผู้บริหาร (Executive Insight)</h3>
        <p className="text-xs text-gray-700 leading-snug">{insightText}</p>
      </div>

      <div className="w-[670px] h-[330px] mx-auto rounded-xl overflow-hidden relative mb-5 border border-slate-300 shadow-md bg-slate-950">
        {mapSnapshot ? (
          <img src={mapSnapshot} alt="Map Capture" className="w-full h-full object-cover object-center bg-slate-950" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
            <MapPin className="w-12 h-12 mb-2 opacity-50" />
            <p className="text-xs">ไม่สามารถจับภาพแผนที่ได้</p>
          </div>
        )}

        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm p-1.5 rounded-md shadow-sm border border-slate-200 flex flex-col items-center text-slate-800">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 16 22 12 17 8 22 12 2" fill="currentColor" />
          </svg>
          <span className="text-[8px] font-black mt-0.5">N</span>
        </div>
        <div className="absolute top-3 left-3 text-[9px] font-mono font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
          14°00&apos;N, 100°15&apos;E
        </div>
        <div className="absolute bottom-5 right-5 text-[8px] font-mono font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
          13°30&apos;N, 100°55&apos;E
        </div>
        <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur-md px-2 py-1 rounded text-white text-[8px] font-mono">
          {mapMode === 'idw' ? 'GEE Satellite Mode' : 'District Bounds Mode'}
        </div>
        <div className="absolute bottom-10 left-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded shadow-sm border border-slate-200 text-[9px] font-mono flex items-center gap-1.5 text-slate-800">
          <div className="w-12 h-[3px] bg-slate-800 relative">
            <div className="absolute top-[-2px] left-0 w-[1px] h-2 bg-slate-800" />
            <div className="absolute top-[-2px] right-0 w-[1px] h-2 bg-slate-800" />
          </div>
          <strong>10 km</strong>
        </div>
      </div>

      <div className="flex gap-5 min-h-0 overflow-hidden">
        <div className="flex-[4] flex flex-col min-w-0">
          <h3 className="text-sm font-bold text-slate-800 mb-3 border-l-4 border-slate-900 pl-2">
            {compareMode ? '10 อันดับเขตที่ความร้อนเพิ่มขึ้น' : '10 อันดับเขตที่ร้อนที่สุด'}
          </h3>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="text-left py-2 text-slate-500 font-bold w-10">อันดับ</th>
                <th className="text-left py-2 text-slate-500 font-bold">เขต</th>
                <th className="text-right py-2 text-slate-500 font-bold">{compareMode ? 'ส่วนต่าง' : 'LST'}</th>
              </tr>
            </thead>
            <tbody>
              {top10.map(([dist, val]: any, idx: number) => (
                <tr key={dist} className="border-b border-slate-100">
                  <td className="py-1.5 text-slate-500 font-mono">{idx + 1}</td>
                  <td className="py-1.5 font-medium truncate max-w-[120px]">{dist}</td>
                  <td className="py-1.5 text-right font-mono font-bold text-slate-700">
                    {compareMode ? (val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2)) : val.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex-[6] flex flex-col border-l border-slate-200 pl-5 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h3 className="text-sm font-bold text-slate-800 border-l-4 border-slate-900 pl-2">แนวโน้มอุณหภูมิ</h3>
            {compareMode && (
              <div className="flex items-center gap-3 text-[9px] font-bold text-slate-500">
                <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-slate-500" /> {compareYear}</span>
                <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-orange-500" /> {summary.selectedYear}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <div className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">
                {compareMode ? `Monthly LST comparison (${compareYear} vs ${summary.selectedYear})` : 'แนวโน้มรายเดือน (Monthly)'}
              </div>
              <div className="flex items-end gap-1 h-20 border-b border-l border-slate-300 pb-1 pl-1">
                {monthlyTrend.map((temp: number, i: number) => {
                  const currentYear = new Date().getFullYear();
                  const currentMonth = new Date().getMonth();
                  const isFutureMonth = summary.selectedYear === currentYear && i > currentMonth;
                  const pct = barPct(temp, monthlyMin, monthlyMax);
                  const baselineTemp = baselineMonthlyTrend[i] || 0;
                  const baselinePct = barPct(baselineTemp, monthlyMin, monthlyMax);

                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                      {!isFutureMonth ? (
                        <>
                          <div className="text-[8px] text-slate-500 font-mono mb-1">{temp.toFixed(1)}</div>
                          {compareMode ? (
                            <div className="w-full h-full flex items-end justify-center gap-[2px]">
                              <div className="w-[42%] bg-slate-500 rounded-t-sm" style={{ height: `${baselinePct}%` }} />
                              <div className="w-[42%] bg-orange-500 rounded-t-sm" style={{ height: `${pct}%` }} />
                            </div>
                          ) : (
                            <div className="w-full bg-orange-500 rounded-t-sm" style={{ height: `${pct}%` }} />
                          )}
                        </>
                      ) : (
                        <div className="w-full bg-slate-200 h-[2px]" />
                      )}
                      <div className="text-[8px] text-slate-600 mt-1">{MONTHS[i]}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">
                {compareMode ? 'Selected year vs baseline average' : 'แนวโน้มรายปี (Yearly)'}
              </div>
              <div className="flex items-end gap-1.5 h-20 border-b border-l border-slate-300 pb-1 pl-1">
                {compareMode ? (
                  [
                    { year: compareYear, temp: baselineAvg, color: 'bg-slate-500' },
                    { year: summary.selectedYear, temp: avgTemp, color: 'bg-orange-500' },
                  ].map((item: any) => {
                    const pct = barPct(item.temp, yearlyMin, yearlyMax);
                    return (
                      <div key={item.year} className="flex-1 flex flex-col items-center justify-end h-full">
                        <div className="text-[8px] text-slate-500 font-mono mb-1">{item.temp.toFixed(1)}</div>
                        <div className={`w-2/3 ${item.color} rounded-t-sm`} style={{ height: `${pct}%` }} />
                        <div className="text-[8px] text-slate-600 mt-1">{item.year}</div>
                      </div>
                    );
                  })
                ) : yearlyTrend.map((item: any, i: number) => {
                  const year = item[0];
                  const temp = item[1];
                  const pct = Math.max(0, Math.min(100, ((temp - 34) / 6) * 100));
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div className="text-[8px] text-slate-500 font-mono mb-1">{temp.toFixed(1)}</div>
                      <div className="w-full bg-slate-700 rounded-t-sm" style={{ height: `${pct}%` }} />
                      <div className="text-[8px] text-slate-600 mt-1">{year.toString().slice(-2)}</div>
                    </div>
                  );
                })}
              </div>
              {compareMode && (
                <div className={`mt-2 text-[10px] font-bold ${delta >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
                  Delta: {delta >= 0 ? '+' : ''}{delta.toFixed(2)}°C
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-3 text-[9px] text-slate-400 border-t border-slate-200 flex justify-between">
        <span>Landsat 8/9 Collection 2 Level 2 · Land Surface Temperature</span>
        <span>Bangkok Urban Heat Island Analytics</span>
      </div>
    </div>
  );
}

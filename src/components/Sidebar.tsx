"use client";

import { useMemo, useState } from "react";
import { Flame, BarChart3, MapPin, Calendar, ChevronDown, ChevronUp, TrendingUp, Globe, Trees, Home } from "lucide-react";
import Link from "next/link";

interface SidebarProps {
  onTagSelect: (tag: string) => void;
  activeTag: string;
  onDistrictSelect: (district: string) => void;
  activeDistrict: string;
  onCategorySelect: (category: string) => void;
  activeCategory: string;
  onDistrictGroupSelect: (group: string) => void;
  activeDistrictGroup: string;
  traffyData: any;
  summary: any;
  loading: boolean;
}

const BANGKOK_DISTRICTS = [
  'พระนคร', 'ดุสิต', 'หนองจอก', 'บางรัก', 'บางเขน', 'บางกะปิ', 'ปทุมวัน', 'ป้อมปราบศัตรูพ่าย', 'พระโขนง', 'มีนบุรี',
  'ลาดกระบัง', 'ยานนาวา', 'สัมพันธวงศ์', 'พญาไท', 'ธนบุรี', 'บางกอกใหญ่', 'ห้วยขวาง', 'คลองสาน', 'ตลิ่งชัน', 'บางกอกน้อย',
  'บางขุนเทียน', 'ภาษีเจริญ', 'หนองแขม', 'ราษฎร์บูรณะ', 'บางพลัด', 'ดินแดง', 'บึงกุ่ม', 'สาทร', 'บางซื่อ', 'จตุจักร',
  'บางคอแหลม', 'ประเวศ', 'คลองเตย', 'สวนหลวง', 'จอมทอง', 'ดอนเมือง', 'ราชเทวี', 'ลาดพร้าว', 'วัฒนา', 'บางแค',
  'หลักสี่', 'สายไหม', 'คันนายาว', 'สะพานสูง', 'วังทองหลาง', 'คลองสามวา', 'บางนา', 'ทวีวัฒนา', 'ทุ่งครุ', 'บางบอน'
].sort((a, b) => a.localeCompare(b, 'th'));

export default function Sidebar({ 
  onTagSelect, activeTag, 
  onDistrictSelect, activeDistrict, 
  onCategorySelect, activeCategory,
  onDistrictGroupSelect, activeDistrictGroup,
  traffyData, summary, loading 
}: SidebarProps) {
  const [showAllDistricts, setShowAllDistricts] = useState(false);

  // Filter tags
  const filterTags = [
    { id: "ทั้งหมด", label: "ทั้งหมด", color: "#64748b" },
    { id: "รอรับเรื่อง", label: "รอรับเรื่อง", color: "#ef4444" },
    { id: "กำลังดำเนินการ", label: "กำลังดำเนินการ", color: "#eab308" },
    { id: "เสร็จสิ้น", label: "เสร็จสิ้น", color: "#22c55e" },
    { id: "ส่งต่อ", label: "ส่งต่อ", color: "#f97316" },
  ];

  const Skeleton = () => (
    <div className="animate-pulse space-y-2">
      {[1, 2, 3, 4].map(i => <div key={i} className="h-3 bg-slate-800 rounded w-full" />)}
    </div>
  );

  return (
    <div className="w-[340px] shrink-0 bg-[#0c1322] border-r border-slate-800/60 flex flex-col h-full z-10 relative">
      {/* Fixed Header */}
      <div className="shrink-0 p-5 pb-3 border-b border-slate-800/60">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg shadow-lg shadow-red-500/20">
            <Flame className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-50 tracking-tight leading-tight">ระบบติดตามปัญหาเมือง</h1>
            <p className="text-[9px] text-slate-500 font-medium uppercase tracking-[0.2em] mt-0.5">TRAFFY FONDUE ANALYTICS DASHBOARD</p>
          </div>
        </div>

        {/* Big KPIs */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-slate-900/80 border border-slate-800/50 rounded-xl p-3 text-center">
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">จำนวนทั้งหมด</div>
            <div className="text-3xl font-black text-slate-50 leading-tight mt-1">
              {loading ? "..." : (summary?.totalApi || summary?.totalFetched || 0).toLocaleString()}
            </div>
            <div className="text-[9px] text-slate-600 mt-0.5">เรื่องร้องเรียน / COMPLAINTS</div>
          </div>
          <div className="bg-slate-900/80 border border-slate-800/50 rounded-xl p-3 text-center">
            <div className="text-[9px] font-bold text-green-500/70 uppercase tracking-widest">แก้ไขสำเร็จ</div>
            <div className="text-3xl font-black text-green-400 leading-tight mt-1">
              {loading ? "..." : (summary?.byState?.['เสร็จสิ้น'] || 0).toLocaleString()}
            </div>
            <div className="text-[9px] text-slate-600 mt-0.5">เรื่อง / RESOLVED</div>
          </div>
        </div>

        <div className="mt-3 text-center text-[10px] text-slate-500 bg-slate-800/30 py-1.5 rounded-lg border border-slate-800/50 flex items-center justify-center gap-1.5">
          <Calendar className="w-3 h-3 text-indigo-400" />
          <span>ข้อมูลตั้งแต่ <b>26 มี.ค. 2026</b> ถึง <b>ปัจจุบัน</b></span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 #0c1322' }}>

        {/* District Filter */}
        <section>
          <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-2.5 flex items-center gap-1.5">
            <MapPin className="w-3 h-3" /> พื้นที่ (DISTRICT)
          </h3>
          <select 
            value={activeDistrict}
            onChange={(e) => onDistrictSelect(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-indigo-500 transition-colors"
          >
            <option value="ทั้งหมด">กรุงเทพมหานคร (ทั้งหมด)</option>
            {BANGKOK_DISTRICTS.map(d => (
              <option key={d} value={d}>เขต{d}</option>
            ))}
          </select>
        </section>

        {/* Status Filters */}
        <section>
          <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-2.5 flex items-center gap-1.5">
            <MapPin className="w-3 h-3" /> ตัวกรองสถานะ (FILTERS)
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {filterTags.map(tag => (
              <button
                key={tag.id}
                onClick={() => onTagSelect(tag.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                  activeTag === tag.id
                    ? 'bg-slate-800 border-slate-600 text-white shadow-lg'
                    : 'bg-transparent border-slate-800 text-slate-500 hover:bg-slate-800/40 hover:text-slate-300'
                }`}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                {tag.label}
                {!loading && summary?.byState?.[tag.id] !== undefined && (
                  <span className="text-[10px] text-slate-600 ml-0.5">({summary.byState[tag.id]})</span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Daily Trend Bar Chart (like the reference image) */}
        <section>
          <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" /> เทรนด์รายวัน · Daily Trend
          </h3>
          {loading ? <Skeleton /> : (
            <div className="flex items-end gap-[3px] h-16">
              {(summary?.dailyTrend || []).map(([day, count]: [string, number], i: number) => {
                const max = Math.max(...(summary?.dailyTrend || []).map((d: any) => d[1]));
                const pct = max > 0 ? (count / max) * 100 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center group relative">
                    <div
                      className="w-full rounded-t-sm bg-gradient-to-t from-orange-600 to-amber-400 transition-all duration-300 group-hover:from-orange-500 group-hover:to-amber-300 min-h-[2px]"
                      style={{ height: `${Math.max(pct, 3)}%` }}
                    />
                    {/* Tooltip */}
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-[9px] px-1.5 py-0.5 rounded text-slate-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                      {day}: {count}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-between text-[8px] text-slate-600 mt-1">
            <span>{summary?.dailyTrend?.[0]?.[0] || ''}</span>
            <span>{summary?.dailyTrend?.[summary?.dailyTrend?.length - 1]?.[0] || ''}</span>
          </div>
        </section>

        {/* Monthly Trend */}
        <section>
          <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5">
            <Calendar className="w-3 h-3" /> เทรนด์รายเดือน · Monthly Trend
          </h3>
          {loading ? <Skeleton /> : (
            <div className="flex items-end gap-[3px] h-14">
              {(summary?.byMonth || []).map(([month, count]: [string, number], i: number) => {
                const max = Math.max(...(summary?.byMonth || []).map((d: any) => d[1]));
                const pct = max > 0 ? (count / max) * 100 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center group relative">
                    <div
                      className="w-full rounded-t-sm bg-gradient-to-t from-indigo-600 to-sky-400 min-h-[2px] transition-all duration-300 group-hover:from-indigo-500 group-hover:to-sky-300"
                      style={{ height: `${Math.max(pct, 3)}%` }}
                    />
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-[9px] px-1.5 py-0.5 rounded text-slate-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                      {month}: {count}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-between text-[8px] text-slate-600 mt-1">
            <span>{summary?.byMonth?.[0]?.[0] || ''}</span>
            <span>{summary?.byMonth?.[summary?.byMonth?.length - 1]?.[0] || ''}</span>
          </div>
        </section>

        <div className="h-px bg-slate-800/60" />

        {/* Problem Category Breakdown (horizontal bars like reference) */}
        <section>
          <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-3 flex items-center gap-1.5">
            <BarChart3 className="w-3 h-3" /> ประเภทปัญหา · By Category
          </h3>
          {loading ? <Skeleton /> : (
            <div className="space-y-2.5">
              {(summary?.byType || []).map(([type, count]: [string, number], i: number) => {
                const max = summary?.byType?.[0]?.[1] || 1;
                const pct = (count / max) * 100;
                const colors = [
                  'from-rose-500 to-rose-400',
                  'from-orange-500 to-amber-400',
                  'from-yellow-500 to-yellow-400',
                  'from-lime-500 to-lime-400',
                  'from-emerald-500 to-emerald-400',
                  'from-teal-500 to-teal-400',
                  'from-cyan-500 to-cyan-400',
                  'from-sky-500 to-sky-400',
                  'from-indigo-500 to-indigo-400',
                  'from-purple-500 to-purple-400',
                ];
                return (
                  <button 
                    key={type}
                    onClick={() => onCategorySelect(activeCategory === type ? 'ทั้งหมด' : type)}
                    className={`w-full text-left group transition-all duration-200 ${
                      activeCategory !== 'ทั้งหมด' && activeCategory !== type 
                        ? 'opacity-40 grayscale-[50%]' 
                        : 'opacity-100 hover:scale-[1.01]'
                    }`}
                  >
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-300 truncate pr-2 max-w-[200px]">{type}</span>
                      <span className="text-slate-500 font-mono tabular-nums">{count}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-800/80 rounded-full overflow-hidden">
                      <div className={`h-full bg-gradient-to-r ${colors[i % colors.length]} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <div className="h-px bg-slate-800/60" />

        {/* District Group Breakdown */}
        <section>
          <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-3 flex items-center gap-1.5">
            <MapPin className="w-3 h-3" /> กลุ่มเขต · By District Group
          </h3>
          {loading ? <Skeleton /> : (
            <div className="space-y-2.5">
              {(summary?.byDistrictGroup || []).filter(([g]: any) => g !== 'ไม่ระบุ').map(([group, count]: [string, number], i: number) => {
                const max = Math.max(...(summary?.byDistrictGroup || []).map((d: any) => d[1]));
                const pct = max > 0 ? (count / max) * 100 : 0;
                const colors = ['from-violet-500 to-fuchsia-400', 'from-blue-500 to-cyan-400', 'from-emerald-500 to-teal-400', 'from-amber-500 to-yellow-400', 'from-rose-500 to-pink-400', 'from-indigo-500 to-blue-400'];
                return (
                  <button 
                    key={group}
                    onClick={() => onDistrictGroupSelect(activeDistrictGroup === group ? 'ทั้งหมด' : group)}
                    className={`w-full text-left group transition-all duration-200 ${
                      activeDistrictGroup !== 'ทั้งหมด' && activeDistrictGroup !== group 
                        ? 'opacity-40 grayscale-[50%]' 
                        : 'opacity-100 hover:scale-[1.01]'
                    }`}
                  >
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-300 truncate pr-2">{group}</span>
                      <span className="text-slate-500 font-mono tabular-nums">{count}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-800/80 rounded-full overflow-hidden">
                      <div className={`h-full bg-gradient-to-r ${colors[i % colors.length]} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <div className="h-px bg-slate-800/60" />

        {/* Top Districts Ranking */}
        <section>
          <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-3 flex items-center gap-1.5">
            <BarChart3 className="w-3 h-3" /> อันดับเขต · Top Districts
          </h3>
          {loading ? <Skeleton /> : (
            <div className="space-y-1.5">
              {(summary?.byDistrict || [])
                .filter(([d]: any) => d !== 'ไม่ระบุ')
                .slice(0, showAllDistricts ? 50 : 10)
                .map(([district, count]: [string, number], i: number) => {
                  const max = summary?.byDistrict?.[0]?.[1] || 1;
                  const pct = (count / max) * 100;
                  return (
                    <button 
                      key={district} 
                      onClick={() => onDistrictSelect(activeDistrict === district ? 'ทั้งหมด' : district)}
                      className={`w-full text-left flex items-center gap-2 group transition-all duration-200 ${
                        activeDistrict !== 'ทั้งหมด' && activeDistrict !== district 
                          ? 'opacity-40 grayscale-[50%]' 
                          : 'opacity-100 hover:scale-[1.01]'
                      }`}
                    >
                      <span className="text-[10px] text-slate-600 w-4 text-right font-mono">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-300 truncate pr-1">{district}</span>
                          <span className="text-slate-500 font-mono tabular-nums shrink-0">{count}</span>
                        </div>
                        <div className="w-full h-1 bg-slate-800/80 rounded-full overflow-hidden mt-0.5">
                          <div className="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              {(summary?.byDistrict?.filter(([d]: any) => d !== 'ไม่ระบุ')?.length || 0) > 10 && (
                <button
                  onClick={() => setShowAllDistricts(!showAllDistricts)}
                  className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 font-medium mt-2 transition-colors"
                >
                  {showAllDistricts ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showAllDistricts ? 'แสดงน้อยลง' : 'แสดงทั้ง 50 เขต'}
                </button>
              )}
            </div>
          )}
        </section>

        {/* Yearly Summary */}
        <section>
          <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-3 flex items-center gap-1.5">
            <Calendar className="w-3 h-3" /> สรุปรายปี · Yearly
          </h3>
          {loading ? <Skeleton /> : (
            <div className="flex gap-2">
              {(summary?.byYear || []).map(([year, count]: [string, number]) => (
                <div key={year} className="flex-1 bg-slate-900/80 border border-slate-800/50 rounded-lg p-2 text-center">
                  <div className="text-[9px] text-slate-500 font-bold">{year}</div>
                  <div className="text-sm font-black text-slate-200 leading-tight">{count.toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>

      {/* Fixed Footer */}
      <div className="shrink-0 px-5 py-3 border-t border-slate-800/60 bg-[#0c1322] flex flex-col gap-2">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 w-full py-2 bg-slate-800/50 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-medium transition-colors border border-slate-700/50"
        >
          <Home className="w-4 h-4 text-cyan-400" />
          หน้า Home ศูนย์วิเคราะห์เมือง
        </Link>
        <Link 
          href="/earth-engine" 
          className="flex items-center justify-center gap-2 w-full py-2 bg-slate-800/50 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-medium transition-colors border border-slate-700/50"
        >
          <Globe className="w-4 h-4 text-emerald-400" />
          วิเคราะห์เกาะความร้อนเมือง
        </Link>
        <Link
          href="/green-space"
          className="flex items-center justify-center gap-2 w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-300 rounded-lg text-xs font-medium transition-colors border border-emerald-500/20"
        >
          <Trees className="w-4 h-4 text-emerald-400" />
          วิเคราะห์พื้นที่สีเขียวเมือง
        </Link>
        <p className="text-[8px] text-slate-600 font-medium uppercase tracking-[0.2em] text-center mt-1">
          Powered by BMA Open Data & Traffy Fondue API · Live Data
        </p>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Flame, BarChart3, MapPin, Calendar, ChevronDown, ChevronUp, TrendingUp, Globe, Trees, Home, X, Building2, Droplets } from "lucide-react";
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
  activeYear: string | null;
  activeMonth: number | null;
  onYearSelect: (year: string | null) => void;
  onMonthSelect: (year: string, month: number | null) => void;
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

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function formatYM(ym: string): string {
  const [year, month] = ym.split('-');
  return `${THAI_MONTHS[parseInt(month) - 1]} ${year}`;
}

export default function Sidebar({
  onTagSelect, activeTag,
  onDistrictSelect, activeDistrict,
  onCategorySelect, activeCategory,
  onDistrictGroupSelect, activeDistrictGroup,
  activeYear, activeMonth,
  onYearSelect, onMonthSelect,
  traffyData, summary, loading
}: SidebarProps) {
  const [showAllDistricts, setShowAllDistricts] = useState(false);

  const filterTags = [
    { id: "ทั้งหมด",         label: "ทั้งหมด",         color: "#64748b" },
    { id: "รอรับเรื่อง",     label: "รอรับเรื่อง",     color: "#ef4444" },
    { id: "กำลังดำเนินการ",  label: "กำลังดำเนินการ",  color: "#eab308" },
    { id: "เสร็จสิ้น",       label: "เสร็จสิ้น",       color: "#22c55e" },
    { id: "ส่งต่อ",          label: "ส่งต่อ",          color: "#f97316" },
  ];

  // Build display months for the chart:
  // - If year selected → fill all 12 months of that year (zeros for missing).
  // - If no year → show all months from byMonth data.
  const displayMonths = useMemo<[string, number][]>(() => {
    const all: [string, number][] = summary?.byMonth || [];
    if (!activeYear) return all;
    return Array.from({ length: 12 }, (_, i) => {
      const key = `${activeYear}-${String(i + 1).padStart(2, '0')}`;
      const found = all.find(([ym]) => ym === key);
      return [key, found ? found[1] : 0];
    });
  }, [summary?.byMonth, activeYear]);

  // Dynamic date range label from byMonth data (ignores year/month filter since byMonth is from base_filtered)
  const dateRangeLabel = useMemo(() => {
    const months: [string, number][] = summary?.byMonth || [];
    if (!months.length) return null;
    const minYM = months[0][0];
    const maxYM = months[months.length - 1][0];
    if (activeYear && activeMonth !== null) {
      return `${THAI_MONTHS[activeMonth - 1]} ${activeYear}`;
    }
    if (activeYear) return `ปี ${activeYear}`;
    if (minYM === maxYM) return formatYM(minYM);
    return `${formatYM(minYM)} – ${formatYM(maxYM)}`;
  }, [summary?.byMonth, activeYear, activeMonth]);

  const hasDateFilter = activeYear !== null || activeMonth !== null;

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

        {/* Date range — dynamic, with clear button if date filter active */}
        <div className="mt-3 text-center text-[10px] text-slate-500 bg-slate-800/30 py-1.5 rounded-lg border border-slate-800/50 flex items-center justify-center gap-1.5">
          <Calendar className="w-3 h-3 text-indigo-400 shrink-0" />
          {loading || !dateRangeLabel ? (
            <span>ข้อมูลตั้งแต่ <b>26 มี.ค. 2026</b> ถึง <b>ปัจจุบัน</b></span>
          ) : (
            <span>ช่วงข้อมูล: <b className={hasDateFilter ? 'text-indigo-300' : ''}>{dateRangeLabel}</b></span>
          )}
          {hasDateFilter && (
            <button
              onClick={() => { onYearSelect(null); }}
              className="ml-1 text-slate-500 hover:text-red-400 transition-colors"
              title="ล้างตัวกรองวันที่"
            >
              <X className="w-3 h-3" />
            </button>
          )}
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

        {/* Year Selector */}
        <section>
          <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-2.5 flex items-center gap-1.5">
            <Calendar className="w-3 h-3" /> กรองตามปี · Year Filter
          </h3>
          {loading ? (
            <div className="animate-pulse flex gap-2">
              {[1, 2].map(i => <div key={i} className="h-12 flex-1 bg-slate-800 rounded-lg" />)}
            </div>
          ) : (summary?.byYear || []).length === 0 ? (
            <p className="text-[10px] text-slate-600">ไม่มีข้อมูล</p>
          ) : (
            <div className="flex gap-2">
              {(summary?.byYear || []).map(([year, count]: [string, number]) => (
                <button
                  key={year}
                  onClick={() => activeYear === year ? onYearSelect(null) : onYearSelect(year)}
                  className={`flex-1 rounded-xl p-2.5 text-center transition-all duration-200 border ${
                    activeYear === year
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 shadow-lg shadow-indigo-500/10'
                      : 'bg-slate-900/80 border-slate-700/50 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                  }`}
                >
                  <div className="text-[9px] font-bold uppercase tracking-widest">ปี</div>
                  <div className="text-base font-black leading-tight">{year}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{count.toLocaleString()} เรื่อง</div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Monthly Trend — interactive, adapts to activeYear */}
        <section>
          <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3" />
              เทรนด์รายเดือน · Monthly
              {activeYear && <span className="text-indigo-400 font-bold ml-1">{activeYear}</span>}
            </span>
            {activeMonth !== null && (
              <button
                onClick={() => activeYear && onMonthSelect(activeYear, null)}
                className="text-[9px] text-slate-500 hover:text-red-400 flex items-center gap-0.5 transition-colors"
              >
                <X className="w-2.5 h-2.5" /> ล้างเดือน
              </button>
            )}
          </h3>
          {loading ? <Skeleton /> : displayMonths.length === 0 ? (
            <p className="text-[10px] text-slate-600">ไม่มีข้อมูล</p>
          ) : (() => {
            const max = Math.max(...displayMonths.map(d => d[1]), 1);
            return (
              <>
                <div className="flex items-end gap-[2px] h-16">
                  {displayMonths.map(([ym, count]) => {
                    const [year, month] = ym.split('-');
                    const monthNum = parseInt(month);
                    const pct = (count / max) * 100;
                    const isActive = activeYear === year && activeMonth === monthNum;
                    const isYearActive = activeYear === year && activeMonth === null;
                    return (
                      <div
                        key={ym}
                        className="flex-1 flex flex-col items-center group relative cursor-pointer"
                        onClick={() => {
                          if (isActive) {
                            onMonthSelect(year, null);
                          } else {
                            onMonthSelect(year, monthNum);
                          }
                        }}
                      >
                        <div
                          className={`w-full rounded-t-sm min-h-[2px] transition-all duration-300 ${
                            isActive
                              ? 'bg-gradient-to-t from-amber-500 to-yellow-300'
                              : isYearActive
                                ? 'bg-gradient-to-t from-indigo-500 to-sky-300'
                                : 'bg-gradient-to-t from-indigo-600 to-sky-400 group-hover:from-indigo-500 group-hover:to-sky-300 opacity-70 group-hover:opacity-100'
                          }`}
                          style={{ height: `${Math.max(pct, count > 0 ? 3 : 1)}%` }}
                        />
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-[9px] px-1.5 py-0.5 rounded text-slate-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                          {THAI_MONTHS[monthNum - 1]} {year}: {count.toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[8px] text-slate-600 mt-1">
                  {activeYear ? (
                    <>
                      <span>ม.ค. {activeYear}</span>
                      <span>ธ.ค. {activeYear}</span>
                    </>
                  ) : (
                    <>
                      <span>{displayMonths[0] ? formatYM(displayMonths[0][0]) : ''}</span>
                      <span>{displayMonths[displayMonths.length - 1] ? formatYM(displayMonths[displayMonths.length - 1][0]) : ''}</span>
                    </>
                  )}
                </div>
              </>
            );
          })()}
        </section>

        {/* Daily Trend — shown only when no month filter (last 30 days) or when month filter active (all days that month) */}
        <section>
          <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" />
            {activeMonth !== null
              ? `รายวัน · ${THAI_MONTHS[activeMonth - 1]}${activeYear ? ' ' + activeYear : ''}`
              : 'เทรนด์รายวัน · Daily (30 วัน)'}
          </h3>
          {loading ? <Skeleton /> : (
            <div className="flex items-end gap-[3px] h-16">
              {(summary?.dailyTrend || []).map(([day, count]: [string, number], i: number) => {
                const max = Math.max(...(summary?.dailyTrend || []).map((d: any) => d[1]), 1);
                const pct = (count / max) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center group relative">
                    <div
                      className="w-full rounded-t-sm bg-gradient-to-t from-orange-600 to-amber-400 transition-all duration-300 group-hover:from-orange-500 group-hover:to-amber-300 min-h-[2px]"
                      style={{ height: `${Math.max(pct, 3)}%` }}
                    />
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

        <div className="h-px bg-slate-800/60" />

        {/* Problem Category Breakdown */}
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
                  'from-rose-500 to-rose-400', 'from-orange-500 to-amber-400', 'from-yellow-500 to-yellow-400',
                  'from-lime-500 to-lime-400', 'from-emerald-500 to-emerald-400', 'from-teal-500 to-teal-400',
                  'from-cyan-500 to-cyan-400', 'from-sky-500 to-sky-400', 'from-indigo-500 to-indigo-400',
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
                const max = Math.max(...(summary?.byDistrictGroup || []).map((d: any) => d[1]), 1);
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
          href="/heat-island"
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
        <Link
          href="/urban-expansion"
          className="flex items-center justify-center gap-2 w-full py-2 bg-slate-800/50 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-medium transition-colors border border-slate-700/50"
        >
          <Building2 className="w-4 h-4 text-indigo-400" />
          วิเคราะห์การขยายตัวเมือง
        </Link>
        <Link
          href="/flood-risk"
          className="flex items-center justify-center gap-2 w-full py-2 bg-slate-800/50 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-medium transition-colors border border-slate-700/50"
        >
          <Droplets className="w-4 h-4 text-sky-400" />
          วิเคราะห์น้ำท่วม/แหล่งน้ำ
        </Link>
        <p className="text-[8px] text-slate-600 font-medium uppercase tracking-[0.2em] text-center mt-1">
          Powered by BMA Open Data & Traffy Fondue API · Live Data
        </p>
      </div>
    </div>
  );
}

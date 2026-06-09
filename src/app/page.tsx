import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Database,
  Droplets,
  Flame,
  Layers,
  MapPin,
  Moon,
  Satellite,
  ShieldAlert,
  Trees,
  Wind,
  Activity,
  Map,
  BarChart3,
  Globe,
  FileSearch,
} from "lucide-react";

const modules = [
  {
    title: "ปัญหาเมือง",
    subtitle: "Traffy Fondue",
    description: "เรื่องร้องเรียนแยกตามเขต ประเภทปัญหา สถานะ และแนวโน้มรายวัน",
    href: "/traffy",
    icon: ShieldAlert,
    accent: "from-orange-500 to-rose-500",
    accentBg: "bg-orange-500/10 border-orange-500/20",
    accentText: "text-orange-400",
    metric: "Traffy",
    metricLabel: "BigQuery Live",
    tag: "complaint",
  },
  {
    title: "เกาะความร้อนเมือง",
    subtitle: "Heat Island · LST",
    description: "ค่า LST จาก Landsat พื้นที่สะสมความร้อนเชิงพื้นที่ รายเขต รายปี",
    href: "/heat-island",
    icon: Flame,
    accent: "from-amber-500 to-red-600",
    accentBg: "bg-amber-500/10 border-amber-500/20",
    accentText: "text-amber-400",
    metric: "°C",
    metricLabel: "Landsat 8/9",
    tag: "thermal",
  },
  {
    title: "พื้นที่สีเขียวเมือง",
    subtitle: "Green Space · NDVI",
    description: "พื้นที่สีเขียว ความหนาแน่นรายเขต ปริมาณไร่ และดัชนี NDVI",
    href: "/green-space",
    icon: Trees,
    accent: "from-emerald-400 to-teal-600",
    accentBg: "bg-emerald-500/10 border-emerald-500/20",
    accentText: "text-emerald-400",
    metric: "NDVI",
    metricLabel: "Sentinel-2",
    tag: "vegetation",
  },
  {
    title: "การขยายตัวของเมือง",
    subtitle: "Urban Expansion · NDBI",
    description: "ความหนาแน่นสิ่งปลูกสร้าง NDBI แนวโน้มการขยายตัว เขตที่เติบโตเร็ว",
    href: "/urban-expansion",
    icon: Building2,
    accent: "from-indigo-500 to-purple-600",
    accentBg: "bg-indigo-500/10 border-indigo-500/20",
    accentText: "text-indigo-400",
    metric: "NDBI",
    metricLabel: "Sentinel-2",
    tag: "builtup",
  },
  {
    title: "น้ำท่วม / แหล่งน้ำ",
    subtitle: "Flood Risk · NDWI",
    description: "ตรวจสัญญาณน้ำและความชื้นรายเขตจาก NDWI/MNDWI เพื่อคัดกรองพื้นที่ตรวจสอบต่อ",
    href: "/flood-risk",
    icon: Droplets,
    accent: "from-sky-500 to-cyan-500",
    accentBg: "bg-sky-500/10 border-sky-500/20",
    accentText: "text-sky-400",
    metric: "NDWI",
    metricLabel: "Sentinel-2",
    tag: "water",
  },
  {
    title: "แสงกลางคืน",
    subtitle: "Nighttime Lights · VIIRS",
    description: "ความเข้มแสงกลางคืนรายปี ศูนย์กิจกรรมเมือง แนวโน้มการเติบโต",
    href: "/nighttime-lights",
    icon: Moon,
    accent: "from-yellow-400 to-orange-500",
    accentBg: "bg-yellow-500/10 border-yellow-500/20",
    accentText: "text-yellow-400",
    metric: "nW/cm²",
    metricLabel: "VIIRS DNB",
    tag: "ntl",
  },
  {
    title: "มลพิษอากาศ",
    subtitle: "Air Quality · Sentinel-5P",
    description: "NO₂, CO, SO₂ และ Aerosol รายเขต ภาพ raster สดจาก Google Earth Engine",
    href: "/air-quality",
    icon: Wind,
    accent: "from-cyan-400 to-sky-600",
    accentBg: "bg-cyan-500/10 border-cyan-500/20",
    accentText: "text-cyan-400",
    metric: "NO₂",
    metricLabel: "Sentinel-5P",
    tag: "air",
  },
];

const platformStats = [
  { label: "โมดูลวิเคราะห์", value: "7", icon: BarChart3, color: "text-cyan-400" },
  { label: "เขต / แขวง",    value: "50 / 180", icon: MapPin, color: "text-emerald-400" },
  { label: "ปีข้อมูล",       value: "9 ปี",   icon: Database, color: "text-amber-400" },
  { label: "ดาวเทียม",       value: "4 ดวง",  icon: Satellite, color: "text-purple-400" },
];

const dataSources = [
  { src: "Landsat 8/9",      desc: "Land Surface Temp (LST)",    color: "text-orange-400" },
  { src: "Sentinel-2 MSI",   desc: "NDVI · NDBI · NDWI",         color: "text-emerald-400" },
  { src: "VIIRS DNB",        desc: "Nighttime Lights annual",     color: "text-yellow-400" },
  { src: "Sentinel-5P TROPOMI", desc: "NO₂ · CO · SO₂",         color: "text-cyan-400" },
  { src: "Traffy Fondue",    desc: "Complaint BigQuery",          color: "text-rose-400" },
  { src: "GEE API",          desc: "Live raster processing",      color: "text-indigo-400" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#07101e] text-slate-50 antialiased overflow-x-hidden">

      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-500/[0.04] blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[600px] rounded-full bg-indigo-500/[0.04] blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">

        {/* Header */}
        <header className="flex items-center justify-between gap-4 rounded-2xl border border-slate-700/50 bg-slate-950/70 px-5 py-3.5 backdrop-blur-md mb-7">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10">
              <Layers className="h-4.5 w-4.5 text-cyan-300" />
            </div>
            <div>
              <div className="text-[14px] font-bold text-slate-100">Bangkok District Analytics</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">City Intelligence Platform</div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold text-emerald-400">
              <Activity className="h-3 w-3" /> Mixed Data Sources
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-slate-700/60 bg-slate-900/50 px-3 py-1 text-[10px] font-bold text-slate-500">
              <Globe className="h-3 w-3" /> Bangkok, Thailand
            </div>
          </div>
        </header>

        {/* Hero section */}
        <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">
              <Map className="h-3.5 w-3.5" /> Geospatial Analytics Hub
            </div>
            <h1 className="text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-[2.6rem]">
              ศูนย์วิเคราะห์เมือง
              <span className="ml-2 bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-transparent">กรุงเทพฯ</span>
            </h1>
            <p className="mt-2.5 max-w-2xl text-[13px] leading-7 text-slate-400">
              รวมการวิเคราะห์สภาพเมืองจากดาวเทียมหลายดวงและ Open Data ไว้ในที่เดียว
              แต่ละโมดูลมี Map / Statistics / Table view สำหรับวิเคราะห์ข้อมูลเชิงพื้นที่รายเขต
            </p>
          </div>

          {/* Platform stats */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 content-start">
            {platformStats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="flex flex-col items-center rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5 text-center">
                  <Icon className={`mb-1 h-4 w-4 ${stat.color}`} />
                  <div className={`text-xl font-black tabular-nums ${stat.color}`}>{stat.value}</div>
                  <div className="text-[9px] uppercase tracking-widest text-slate-600 mt-0.5">{stat.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* District Analysis featured card */}
        <Link
          href="/district-analysis"
          className="group mb-6 relative flex items-center gap-5 overflow-hidden rounded-2xl border border-cyan-700/30 bg-gradient-to-r from-cyan-950/60 to-slate-950/80 p-5 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-600/50 hover:shadow-2xl hover:shadow-cyan-900/20"
        >
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 opacity-70 group-hover:opacity-100 transition-opacity" />
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-cyan-900/40">
            <FileSearch className="h-7 w-7 text-white drop-shadow" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-500 mb-0.5">Cross-Module · District Profile</div>
            <div className="text-[17px] font-black text-white">วิเคราะห์รายเขต — ครบทุกมิติ</div>
            <div className="text-[12px] text-slate-400 mt-1">เลือกเขตดูข้อมูลทุกตัวชี้วัดในที่เดียว: อุณหภูมิ · พื้นที่สีเขียว · สิ่งปลูกสร้าง · คุณภาพอากาศ · แสงไฟ เปรียบเทียบกับค่าเฉลี่ยกรุงเทพฯ และ export รายงานได้</div>
          </div>
          <ArrowRight className="h-5 w-5 text-cyan-400 shrink-0 group-hover:translate-x-1 transition-transform" />
        </Link>

        {/* Module cards */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">โมดูลวิเคราะห์</h2>
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-[10px] text-slate-600">แต่ละโมดูลมี Map · Statistics · Table view</span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {modules.map((mod) => {
              const Icon = mod.icon;
              return (
                <Link
                  key={mod.href}
                  href={mod.href}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/70 p-5 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-600/70 hover:bg-slate-900/80 hover:shadow-2xl hover:shadow-black/30"
                >
                  {/* Gradient top bar */}
                  <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${mod.accent} opacity-60 transition-opacity group-hover:opacity-100`} />

                  {/* Header row */}
                  <div className="flex items-start gap-3 mb-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${mod.accent} shadow-md`}>
                      <Icon className="h-5 w-5 text-white drop-shadow" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 truncate">{mod.subtitle}</div>
                      <div className="text-[15px] font-black text-white leading-tight mt-0.5">{mod.title}</div>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="flex-1 text-[12px] leading-relaxed text-slate-400 mb-4">
                    {mod.description}
                  </p>

                  {/* Footer row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold ${mod.accentBg} ${mod.accentText}`}>
                        {mod.metric}
                      </span>
                      <span className="text-[10px] text-slate-600">{mod.metricLabel}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500 group-hover:text-cyan-400 transition-colors">
                      เปิด <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Data sources */}
        <section className="mt-8 rounded-2xl border border-slate-800/60 bg-slate-900/30 p-5">
          <div className="flex items-center gap-3 mb-4">
            <Database className="h-4 w-4 text-slate-500" />
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">แหล่งข้อมูลที่ใช้</h2>
            <div className="flex-1 h-px bg-slate-800" />
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
            {dataSources.map(({ src, desc, color }) => (
              <div key={src} className="min-w-0">
                <div className={`text-[11px] font-bold font-mono truncate ${color}`}>{src}</div>
                <div className="text-[10px] text-slate-600 truncate mt-0.5">{desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-6 pb-4 text-center text-[10px] text-slate-700">
          Bangkok District Analytics · Open Data + Google Earth Engine · Cloudflare Workers
        </footer>
      </div>
    </div>
  );
}

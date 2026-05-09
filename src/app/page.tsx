import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Compass,
  Database,
  Droplets,
  Flame,
  Layers,
  MapPinned,
  Moon,
  Plus,
  Satellite,
  ShieldAlert,
  Trees,
  Wind,
} from "lucide-react";

const analysisModules = [
  {
    title: "วิเคราะห์ปัญหาเมือง",
    eyebrow: "ปัญหาเมือง · Traffy Fondue",
    description: "ติดตามเรื่องร้องเรียน Traffy Fondue แยกตามเขต ประเภทปัญหา สถานะ และแนวโน้มรายวัน",
    href: "/traffy",
    icon: ShieldAlert,
    accent: "from-orange-500 to-rose-500",
    metric: "Traffy",
  },
  {
    title: "วิเคราะห์เกาะความร้อนเมือง",
    eyebrow: "เกาะความร้อน · Landsat",
    description: "ค่า LST จาก Landsat วิเคราะห์พื้นที่สะสมความร้อนเชิงพื้นที่ โดยไม่ตีความเป็นอุณหภูมิอากาศ",
    href: "/heat-island",
    icon: Flame,
    accent: "from-amber-500 to-red-600",
    metric: "LST",
  },
  {
    title: "วิเคราะห์พื้นที่สีเขียวเมือง",
    eyebrow: "พื้นที่สีเขียว · Sentinel-2",
    description: "ประเมินพื้นที่สีเขียว ความหนาแน่นรายเขต ปริมาณไร่ และค่า NDVI ประกอบ",
    href: "/green-space",
    icon: Trees,
    accent: "from-emerald-400 to-teal-600",
    metric: "NDVI",
  },
  {
    title: "วิเคราะห์การขยายตัวของเมือง",
    eyebrow: "การขยายตัวเมือง · Sentinel-2",
    description: "ความหนาแน่นสิ่งปลูกสร้างด้วย NDBI เพื่อดูแนวโน้มการขยายตัวและเมืองที่เติบโตเร็ว",
    href: "/urban-expansion",
    icon: Building2,
    accent: "from-indigo-500 to-purple-600",
    metric: "NDBI",
  },
  {
    title: "วิเคราะห์น้ำท่วม / แหล่งน้ำ",
    eyebrow: "ความเสี่ยงน้ำท่วม · Sentinel-2",
    description: "ติดตามพื้นที่น้ำ ความเสี่ยงรายเขต ด้วย NDWI/MNDWI และ Traffy Fondue",
    href: "/flood-risk",
    icon: Droplets,
    accent: "from-sky-500 to-cyan-500",
    metric: "NDWI",
  },
  {
    title: "วิเคราะห์แสงกลางคืน",
    eyebrow: "กิจกรรมเมืองกลางคืน · VIIRS",
    description: "วิเคราะห์ความเข้มแสงกลางคืนจาก VIIRS DNB รายปี เพื่อดูศูนย์กิจกรรมและการเติบโตเมือง",
    href: "/nighttime-lights",
    icon: Moon,
    accent: "from-yellow-400 to-orange-500",
    metric: "VIIRS",
  },
  {
    title: "วิเคราะห์มลพิษอากาศ",
    eyebrow: "มลพิษอากาศ · Sentinel-5P",
    description: "ติดตาม NO₂, CO, SO₂ และ Aerosol รายเขต พร้อมภาพ raster สดจาก Google Earth Engine",
    href: "/air-quality",
    icon: Wind,
    accent: "from-cyan-400 to-sky-600",
    metric: "S5P",
  },
];

const futureModules = [
  { title: "การเดินทางและการเข้าถึง",         icon: Compass  },
  { title: "ระบบขนส่งสาธารณะ",               icon: Layers   },
  { title: "ประชากรและการใช้ที่ดิน",           icon: Database },
];

const platformStats = [
  { label: "พื้นที่วิเคราะห์",   value: "50 เขต / 180 แขวง", icon: Building2 },
  { label: "แหล่งข้อมูล",       value: "Open Data + GEE",    icon: Database  },
  { label: "ดาวเทียม",          value: "Sentinel / Landsat", icon: Satellite },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#08111f] text-slate-50 antialiased">

      {/* ── Background ─────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-cyan-500/[0.055] blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(8,17,31,0.15),rgba(8,17,31,0.15)),url('https://a.basemaps.cartocdn.com/dark_all/12/3190/1856.png')",
            backgroundSize: "256px 256px",
            backgroundRepeat: "repeat",
          }}
        />
      </div>

      {/* ── Page wrapper ───────────────────────────────── */}
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-10">

        {/* ── Header ─────────────────────────────────────── */}
        <header className="flex items-center justify-between gap-4 rounded-2xl border border-slate-700/50 bg-slate-950/60 px-5 py-3.5 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[13px] font-bold tracking-wide text-slate-100">Bangkok District Analytics</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">City Intelligence Dashboard</div>
            </div>
          </div>
          <nav className="hidden items-center gap-1 text-[12px] text-slate-400 sm:flex">
            <a href="#modules" className="rounded-lg px-3 py-2 transition-colors hover:bg-slate-800/70 hover:text-slate-100">ชุดวิเคราะห์</a>
            <a href="#future"  className="rounded-lg px-3 py-2 transition-colors hover:bg-slate-800/70 hover:text-slate-100">ต่อยอดอนาคต</a>
          </nav>
        </header>

        {/* ── Main 2-column grid ─────────────────────────── */}
        <div className="grid flex-1 items-start gap-8 py-8 lg:grid-cols-[1fr_1.5fr]">

          {/* ── LEFT: Hero ─────────────────────────────────── */}
          <div className="lg:sticky lg:top-8">

            {/* badge */}
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
              <MapPinned className="h-3.5 w-3.5" />
              Bangkok Urban Analytics Hub
            </div>

            {/* heading */}
            <h1 className="text-4xl font-black leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-[3.25rem]">
              ศูนย์วิเคราะห์เมือง
              <span className="mt-1 block bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-transparent">
                กรุงเทพฯ
              </span>
              สำหรับตัดสินใจเชิงพื้นที่
            </h1>

            <p className="mt-5 max-w-md text-[14px] leading-7 text-slate-400">
              รวมการวิเคราะห์ปัญหาเมือง เกาะความร้อน พื้นที่สีเขียว และสัญญาณดาวเทียม
              ไว้ในที่เดียว เพื่อให้ผู้บริหารและนักวิเคราะห์เมืองเลือกดูข้อมูลได้เร็วขึ้น
            </p>

            {/* stats */}
            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {platformStats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-900/50 px-4 py-3.5 backdrop-blur-sm">
                    <Icon className="h-4 w-4 shrink-0 text-cyan-400/80" />
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-black text-white">{stat.value}</div>
                      <div className="text-[10px] uppercase tracking-widest text-slate-500">{stat.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* data sources detail */}
            <div className="mt-4 rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">ข้อมูลที่ใช้วิเคราะห์</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-slate-400">
                {[
                  ["Sentinel-2",  "NDVI · NDBI · NDWI"],
                  ["Landsat 8/9", "Land Surface Temp"],
                  ["VIIRS DNB",   "Nighttime Lights"],
                  ["Sentinel-5P", "NO₂ · CO · SO₂"],
                  ["Traffy Fondue","ร้องเรียนเมือง"],
                  ["GEE API",     "ประมวลผล live"],
                ].map(([src, desc]) => (
                  <div key={src} className="flex items-baseline gap-1.5">
                    <span className="shrink-0 font-mono text-[10px] text-cyan-400">{src}</span>
                    <span className="truncate text-slate-500">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* future modules */}
            <div id="future" className="mt-4 rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[12px] font-bold text-slate-300">โมดูลที่กำลังพัฒนา</h3>
                <Plus className="h-4 w-4 text-slate-500" />
              </div>
              <div className="grid gap-2">
                {futureModules.map((m) => {
                  const Icon = m.icon;
                  return (
                    <div key={m.title} className="flex items-center gap-3 rounded-lg border border-dashed border-slate-700/50 bg-slate-900/40 px-3 py-2.5">
                      <Icon className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="text-[12px] text-slate-400">{m.title}</span>
                      <span className="ml-auto text-[9px] font-bold uppercase tracking-widest text-slate-600">เร็วๆ นี้</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── RIGHT: Module cards — 2-column grid ────────── */}
          <div id="modules" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {analysisModules.map((module) => {
              const Icon = module.icon;
              return (
                <Link
                  key={module.href}
                  href={module.href}
                  className="group relative overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/65 p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-600/80 hover:bg-slate-900/85 hover:shadow-xl hover:shadow-black/40"
                >
                  {/* accent top line */}
                  <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${module.accent} opacity-70 transition-opacity group-hover:opacity-100`} />

                  {/* top row: eyebrow + LIVE + metric + arrow */}
                  <div className="mb-2 flex items-center gap-1.5">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${module.accent} shadow-md`}>
                      <Icon className="h-4 w-4 text-white drop-shadow" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">
                        {module.eyebrow}
                      </span>
                    </div>
                    <span className="shrink-0 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase text-emerald-400">
                      Live
                    </span>
                    <span className="shrink-0 rounded-md border border-slate-700/80 bg-slate-900/70 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                      {module.metric}
                    </span>
                  </div>

                  {/* title + description + arrow */}
                  <div className="flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-[15px] font-black leading-snug text-white">{module.title}</h2>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-400">
                        {module.description}
                      </p>
                    </div>
                    <ArrowRight className="mb-0.5 h-4 w-4 shrink-0 text-slate-600 transition-all group-hover:translate-x-0.5 group-hover:text-cyan-300" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────── */}
        <footer className="mt-2 border-t border-slate-800/50 py-4 text-center text-[11px] text-slate-600">
          Bangkok District Analytics · Open Data + Google Earth Engine
        </footer>
      </div>
    </main>
  );
}

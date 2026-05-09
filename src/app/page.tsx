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
    eyebrow: "Urban Issues",
    description: "ติดตามเรื่องร้องเรียน Traffy Fondue แยกตามเขต ประเภทปัญหา สถานะ และแนวโน้มรายวัน",
    href: "/traffy",
    icon: ShieldAlert,
    accent: "from-orange-500 to-rose-500",
    metric: "Traffy",
  },
  {
    title: "Land Surface Temperature",
    eyebrow: "Heat Island · Landsat",
    description: "ค่า LST จาก Landsat วิเคราะห์พื้นที่สะสมความร้อนเชิงพื้นที่ โดยไม่ตีความเป็นอุณหภูมิอากาศ",
    href: "/heat-island",
    icon: Flame,
    accent: "from-amber-500 to-red-600",
    metric: "LST",
  },
  {
    title: "วิเคราะห์พื้นที่สีเขียวเมือง",
    eyebrow: "Green Space · Sentinel-2",
    description: "ประเมินพื้นที่สีเขียว ความหนาแน่นรายเขต ปริมาณไร่ และค่า NDVI ประกอบ",
    href: "/green-space",
    icon: Trees,
    accent: "from-emerald-400 to-teal-600",
    metric: "NDVI",
  },
  {
    title: "วิเคราะห์การขยายตัวของเมือง",
    eyebrow: "Urban Expansion · Sentinel-2",
    description: "ความหนาแน่นสิ่งปลูกสร้างด้วย NDBI เพื่อดูแนวโน้มการขยายตัวของเมือง",
    href: "/urban-expansion",
    icon: Building2,
    accent: "from-indigo-500 to-purple-600",
    metric: "NDBI",
  },
  {
    title: "วิเคราะห์น้ำท่วม / แหล่งน้ำ",
    eyebrow: "Flood Risk · Sentinel-2",
    description: "ติดตามพื้นที่น้ำ ความเสี่ยงรายเขต ด้วย NDWI/MNDWI และ Traffy Fondue",
    href: "/flood-risk",
    icon: Droplets,
    accent: "from-sky-500 to-cyan-500",
    metric: "NDWI",
  },
  {
    title: "Nighttime Lights",
    eyebrow: "กิจกรรมเมืองกลางคืน · VIIRS",
    description: "วิเคราะห์ความเข้มแสงกลางคืนจาก VIIRS DNB เพื่อเปรียบเทียบกิจกรรมเมืองรายปี",
    href: "/nighttime-lights",
    icon: Moon,
    accent: "from-yellow-400 to-orange-500",
    metric: "VIIRS",
  },
  {
    title: "มลพิษอากาศจากดาวเทียม",
    eyebrow: "Air Pollution · Sentinel-5P",
    description: "ติดตาม NO2, CO, SO2 และ Aerosol proxy รายเขต พร้อมภาพ raster สดจาก Google Earth Engine",
    href: "/air-quality",
    icon: Wind,
    accent: "from-cyan-400 to-sky-600",
    metric: "S5P",
  },
];

const futureModules = [
  { title: "การเดินทางและการเข้าถึง", icon: Compass },
];

const platformStats = [
  { label: "พื้นที่วิเคราะห์", value: "50 เขต", icon: Building2 },
  { label: "แหล่งข้อมูล", value: "Open Data + GEE", icon: Database },
  { label: "ดาวเทียม", value: "Sentinel-2 / Landsat", icon: Satellite },
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
        <div className="grid flex-1 items-start gap-8 py-8 lg:grid-cols-[1fr_1.15fr]">

          {/* ── LEFT: Hero ─────────────────────────────── */}
          <div className="lg:sticky lg:top-8 lg:max-h-[calc(100vh-6rem)] lg:overflow-hidden">
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
                      <div className="truncate text-[13px] font-black text-white">{stat.value}</div>
                      <div className="text-[10px] uppercase tracking-widest text-slate-500">{stat.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* future — tucked below stats on desktop */}
            <div id="future" className="mt-6 rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
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

          {/* ── RIGHT: Module cards ────────────────────── */}
          <div id="modules" className="flex flex-col gap-3">
            {analysisModules.map((module) => {
              const Icon = module.icon;
              return (
                <Link
                  key={module.href}
                  href={module.href}
                  className="group relative overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/65 p-5 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-600/80 hover:bg-slate-900/85 hover:shadow-xl hover:shadow-black/40"
                >
                  {/* gradient accent top */}
                  <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${module.accent} opacity-70 transition-opacity group-hover:opacity-100`} />

                  <div className="flex items-start gap-4">
                    {/* icon */}
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${module.accent} shadow-lg`}>
                      <Icon className="h-6 w-6 text-white drop-shadow" />
                    </div>

                    {/* content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                          {module.eyebrow}
                        </span>
                        <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-400">
                          Live
                        </span>
                      </div>
                      <h2 className="mt-1 text-xl font-black leading-snug text-white">
                        {module.title}
                      </h2>
                      <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-slate-400">
                        {module.description}
                      </p>
                    </div>

                    {/* right side */}
                    <div className="flex shrink-0 flex-col items-end gap-3 pl-1">
                      <span className="rounded-lg border border-slate-700/80 bg-slate-900/70 px-2.5 py-1 font-mono text-[11px] font-bold text-cyan-300">
                        {module.metric}
                      </span>
                      <ArrowRight className="h-5 w-5 text-slate-500 transition-all group-hover:translate-x-0.5 group-hover:text-cyan-300" />
                    </div>
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

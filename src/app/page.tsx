import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Building2,
  Compass,
  Database,
  Droplets,
  Flame,
  Layers,
  MapPinned,
  Moon,
  Satellite,
  ShieldAlert,
  Sparkles,
  Trees,
} from "lucide-react";

const analysisModules = [
  {
    title: "วิเคราะห์ปัญหาเมือง",
    eyebrow: "Urban Issues · Traffy Fondue",
    description: "ติดตามเรื่องร้องเรียนแยกตามเขต ประเภทปัญหา สถานะ และแนวโน้มรายวัน",
    href: "/traffy",
    icon: ShieldAlert,
    accent: "from-orange-500 to-rose-500",
    glow: "group-hover:shadow-orange-500/15",
    metric: "Traffy",
  },
  {
    title: "เกาะความร้อนเมือง",
    eyebrow: "Heat Island · Landsat",
    description: "ค่า LST จาก Landsat วิเคราะห์พื้นที่สะสมความร้อนและเปรียบเทียบรายปี",
    href: "/heat-island",
    icon: Flame,
    accent: "from-amber-500 to-red-600",
    glow: "group-hover:shadow-amber-500/15",
    metric: "LST",
  },
  {
    title: "พื้นที่สีเขียวเมือง",
    eyebrow: "Green Space · Sentinel-2",
    description: "ประเมินความหนาแน่นพื้นที่สีเขียว ปริมาณไร่ และค่า NDVI รายเขต",
    href: "/green-space",
    icon: Trees,
    accent: "from-emerald-400 to-teal-600",
    glow: "group-hover:shadow-emerald-500/15",
    metric: "NDVI",
  },
  {
    title: "การขยายตัวของเมือง",
    eyebrow: "Urban Expansion · Sentinel-2",
    description: "ความหนาแน่นสิ่งปลูกสร้างด้วย NDBI และแนวโน้มการขยายตัวเชิงพื้นที่",
    href: "/urban-expansion",
    icon: Building2,
    accent: "from-indigo-500 to-purple-600",
    glow: "group-hover:shadow-indigo-500/15",
    metric: "NDBI",
  },
  {
    title: "น้ำท่วม / แหล่งน้ำ",
    eyebrow: "Flood Risk · Sentinel-2",
    description: "ติดตามพื้นที่น้ำ ความเสี่ยงน้ำท่วมรายเขต ด้วย NDWI/MNDWI และ Traffy",
    href: "/flood-risk",
    icon: Droplets,
    accent: "from-sky-500 to-cyan-500",
    glow: "group-hover:shadow-sky-500/15",
    metric: "NDWI",
  },
  {
    title: "ความสว่างกลางคืน",
    eyebrow: "Nighttime Lights · VIIRS",
    description: "วิเคราะห์ความเข้มแสงกลางคืนจาก VIIRS DNB เพื่อดูกิจกรรมเมืองรายปี",
    href: "/nighttime-lights",
    icon: Moon,
    accent: "from-yellow-400 to-orange-500",
    glow: "group-hover:shadow-yellow-500/15",
    metric: "VIIRS",
  },
];

const futureModules = [
  { title: "คุณภาพอากาศ (AQI)", icon: Activity },
  { title: "การเดินทางและการเข้าถึง", icon: Compass },
];

const platformStats = [
  { label: "เขตในกรุงเทพฯ", value: "50", unit: "เขต", icon: MapPinned },
  { label: "แหล่งข้อมูลดาวเทียม", value: "4", unit: "ดาวเทียม", icon: Satellite },
  { label: "ชุดวิเคราะห์ที่พร้อมใช้", value: "6", unit: "โมดูล", icon: Database },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#060d18] text-slate-50 antialiased">

      {/* ── Background layers ───────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {/* radial glow — top-centre */}
        <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-500/[0.06] blur-3xl" />
        {/* map-tile texture */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(8,17,31,0.1),rgba(8,17,31,0.1)),url('https://a.basemaps.cartocdn.com/dark_all/12/3190/1856.png')",
            backgroundSize: "256px 256px",
            backgroundRepeat: "repeat",
          }}
        />
        {/* subtle bottom fade */}
        <div className="absolute bottom-0 inset-x-0 h-64 bg-gradient-to-t from-[#060d18] to-transparent" />
      </div>

      {/* ── Content wrapper ─────────────────────────────── */}
      <div className="relative z-10 mx-auto max-w-screen-xl px-5 sm:px-8 lg:px-12">

        {/* ── Header nav ──────────────────────────────────── */}
        <header className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
              <Layers className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="text-[13px] font-bold leading-none tracking-wide text-slate-100">Bangkok District Analytics</div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">City Intelligence</div>
            </div>
          </div>
          <nav className="hidden items-center gap-1 text-[12px] text-slate-400 sm:flex">
            <a href="#modules" className="rounded-lg px-3 py-2 transition-colors hover:bg-slate-800/70 hover:text-slate-100">ชุดวิเคราะห์</a>
            <a href="#future"  className="rounded-lg px-3 py-2 transition-colors hover:bg-slate-800/70 hover:text-slate-100">อนาคต</a>
          </nav>
        </header>

        {/* ── Hero ────────────────────────────────────────── */}
        <section className="pb-12 pt-14 text-center">
          {/* badge */}
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
            <MapPinned className="h-3.5 w-3.5" />
            Bangkok Urban Analytics Hub
          </div>

          {/* heading */}
          <h1 className="mx-auto max-w-3xl text-4xl font-black leading-[1.12] tracking-tight text-white sm:text-5xl lg:text-[3.5rem]">
            ศูนย์วิเคราะห์เมือง
            <span className="block bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-transparent">
              กรุงเทพมหานคร
            </span>
          </h1>

          {/* sub */}
          <p className="mx-auto mt-5 max-w-xl text-[14px] leading-7 text-slate-400 sm:text-[15px]">
            รวมการวิเคราะห์ปัญหาเมือง เกาะความร้อน พื้นที่สีเขียว และสัญญาณดาวเทียมไว้ในที่เดียว
            เพื่อสนับสนุนการตัดสินใจเชิงพื้นที่ของกรุงเทพมหานคร
          </p>

          {/* stat chips */}
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {platformStats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="flex items-center gap-3 rounded-xl border border-slate-700/70 bg-slate-900/60 px-5 py-3 backdrop-blur-sm"
                >
                  <Icon className="h-4 w-4 shrink-0 text-cyan-400/80" />
                  <span className="text-xl font-black tabular-nums text-white">{stat.value}</span>
                  <div className="text-left">
                    <div className="text-[11px] font-semibold text-slate-200">{stat.unit}</div>
                    <div className="text-[9px] uppercase tracking-widest text-slate-500">{stat.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Module grid ─────────────────────────────────── */}
        <section id="modules" className="pb-14">
          {/* section label */}
          <div className="mb-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-slate-800" />
            <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
              <Sparkles className="h-3 w-3 text-cyan-500/70" />
              ชุดวิเคราะห์ที่พร้อมใช้งาน
            </span>
            <div className="h-px flex-1 bg-slate-800" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {analysisModules.map((module) => {
              const Icon = module.icon;
              return (
                <Link
                  key={module.href}
                  href={module.href}
                  className={`group relative flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-700 hover:bg-slate-900/90 hover:shadow-2xl ${module.glow}`}
                >
                  {/* top gradient accent */}
                  <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${module.accent} opacity-80 transition-opacity group-hover:opacity-100`} />

                  {/* card header */}
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${module.accent} shadow-lg`}>
                      <Icon className="h-5 w-5 text-white drop-shadow" />
                    </div>
                    <span className="mt-0.5 rounded-md border border-slate-700/80 bg-slate-800/80 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                      {module.metric}
                    </span>
                  </div>

                  {/* text */}
                  <div className="flex-1">
                    <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                      {module.eyebrow}
                    </div>
                    <h2 className="text-[15px] font-black leading-snug text-white">
                      {module.title}
                    </h2>
                    <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-slate-400">
                      {module.description}
                    </p>
                  </div>

                  {/* footer link */}
                  <div className="mt-4 flex items-center gap-1 border-t border-slate-800/60 pt-3.5 text-[11px] font-bold text-slate-500 transition-colors group-hover:text-cyan-300">
                    <span>เปิดแดชบอร์ด</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    <span className="ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-400">
                      Live
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── Future modules ──────────────────────────────── */}
        <section id="future" className="pb-12">
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[13px] font-bold text-slate-200">โมดูลที่กำลังพัฒนา</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">ออกแบบเป็น modular — เพิ่มหน้าใหม่ได้โดยไม่รบกวนชุดเดิม</p>
              </div>
              <span className="rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                เร็วๆ นี้
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {futureModules.map((module) => {
                const Icon = module.icon;
                return (
                  <div
                    key={module.title}
                    className="flex items-center gap-3 rounded-xl border border-dashed border-slate-700/50 bg-slate-900/40 px-4 py-3"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/60">
                      <Icon className="h-4 w-4 text-slate-500" />
                    </div>
                    <span className="text-[13px] text-slate-400">{module.title}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Footer ──────────────────────────────────────── */}
        <footer className="border-t border-slate-800/60 py-5 text-center text-[11px] text-slate-600">
          Bangkok District Analytics · Open Data + Google Earth Engine · สร้างสำหรับนักวิเคราะห์เมือง
        </footer>
      </div>
    </main>
  );
}

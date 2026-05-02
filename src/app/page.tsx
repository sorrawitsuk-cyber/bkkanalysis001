import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Building2,
  Compass,
  Database,
  Flame,
  Layers,
  MapPinned,
  Plus,
  Satellite,
  ShieldAlert,
  Trees,
} from "lucide-react";

const analysisModules = [
  {
    title: "วิเคราะห์ปัญหาเมือง",
    eyebrow: "Urban Issues",
    description: "ติดตามเรื่องร้องเรียน Traffy Fondue แยกตามเขต ประเภทปัญหา สถานะ และแนวโน้มรายวัน",
    href: "/urban-issues",
    icon: ShieldAlert,
    accent: "from-orange-500 to-rose-500",
    metric: "Traffy",
    status: "พร้อมใช้งาน",
  },
  {
    title: "วิเคราะห์เกาะความร้อนเมือง",
    eyebrow: "Urban Heat Island",
    description: "ดูอุณหภูมิพื้นผิวจาก Landsat, เปรียบเทียบรายปี, popup ค่า pixel และจัดอันดับเขตร้อน",
    href: "/earth-engine",
    icon: Flame,
    accent: "from-amber-500 to-red-600",
    metric: "LST",
    status: "พร้อมใช้งาน",
  },
  {
    title: "วิเคราะห์พื้นที่สีเขียวเมือง",
    eyebrow: "Green Space",
    description: "ประเมินพื้นที่สีเขียวจาก Sentinel-2, ความหนาแน่นรายเขต, ปริมาณไร่ และค่า NDVI ประกอบ",
    href: "/green-space",
    icon: Trees,
    accent: "from-emerald-400 to-teal-600",
    metric: "NDVI",
    status: "พร้อมใช้งาน",
  },
];

const futureModules = [
  { title: "น้ำท่วมและจุดเสี่ยง", icon: MapPinned },
  { title: "คุณภาพอากาศ", icon: Activity },
  { title: "การเดินทางและการเข้าถึง", icon: Compass },
];

const platformStats = [
  { label: "พื้นที่วิเคราะห์", value: "50 เขต", icon: Building2 },
  { label: "แหล่งข้อมูลหลัก", value: "Open Data + GEE", icon: Database },
  { label: "ภาพดาวเทียม", value: "Sentinel-2 / Landsat", icon: Satellite },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#08111f] text-slate-50">
      <section className="relative min-h-screen overflow-hidden">
        <div
          className="absolute inset-0 opacity-45"
          style={{
            backgroundImage:
              "linear-gradient(rgba(8,17,31,0.30), rgba(8,17,31,0.92)), url('https://a.basemaps.cartocdn.com/dark_all/12/3190/1856.png')",
            backgroundSize: "256px 256px",
            backgroundRepeat: "repeat",
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,17,31,0.96)_0%,rgba(8,17,31,0.68)_48%,rgba(8,17,31,0.94)_100%)]" />

        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-10">
          <header className="flex items-center justify-between gap-4 rounded-xl border border-slate-700/60 bg-slate-950/55 px-4 py-3 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold tracking-wide">Bangkok District Analytics</div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">City Intelligence Dashboard</div>
              </div>
            </div>
            <nav className="hidden items-center gap-2 text-xs text-slate-400 md:flex">
              <a href="#modules" className="rounded-md px-3 py-2 hover:bg-slate-800/70 hover:text-slate-100">ชุดวิเคราะห์</a>
              <a href="#future" className="rounded-md px-3 py-2 hover:bg-slate-800/70 hover:text-slate-100">ต่อยอดอนาคต</a>
            </nav>
          </header>

          <div className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-200">
                <MapPinned className="h-3.5 w-3.5" />
                Bangkok Urban Analytics Hub
              </div>
              <h1 className="text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
                ศูนย์วิเคราะห์เมืองกรุงเทพฯ สำหรับตัดสินใจเชิงพื้นที่
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                รวมการวิเคราะห์ปัญหาเมือง เกาะความร้อน และพื้นที่สีเขียวไว้ในหน้าเริ่มต้นเดียว
                เพื่อให้ผู้บริหารและนักวิเคราะห์เมืองเลือกดูข้อมูลที่ต้องการได้เร็วขึ้น และพร้อมเพิ่มโมดูลใหม่ในอนาคต
              </p>

              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                {platformStats.map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div key={stat.label} className="rounded-xl border border-slate-700/70 bg-slate-950/55 p-4 backdrop-blur-md">
                      <Icon className="mb-3 h-4 w-4 text-cyan-300" />
                      <div className="text-lg font-black text-white">{stat.value}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.15em] text-slate-500">{stat.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div id="modules" className="grid gap-4">
              {analysisModules.map((module) => {
                const Icon = module.icon;
                return (
                  <Link
                    key={module.href}
                    href={module.href}
                    className="group block rounded-xl border border-slate-700/70 bg-slate-950/70 p-4 shadow-2xl backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-slate-900/85"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${module.accent} shadow-lg`}>
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{module.eyebrow}</span>
                          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                            {module.status}
                          </span>
                        </div>
                        <h2 className="mt-1 text-xl font-black text-white">{module.title}</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-400">{module.description}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-3">
                        <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-cyan-300">{module.metric}</span>
                        <ArrowRight className="h-5 w-5 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-cyan-300" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div id="future" className="mb-2 rounded-xl border border-slate-700/60 bg-slate-950/55 p-4 backdrop-blur-md">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100">รองรับการวิเคราะห์อื่น ๆ ในอนาคต</h3>
                <p className="mt-1 text-xs text-slate-500">ออกแบบเป็นโมดูล เพิ่มหน้าใหม่ได้โดยไม่รบกวนชุดวิเคราะห์เดิม</p>
              </div>
              <Plus className="h-5 w-5 text-cyan-300" />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {futureModules.map((module) => {
                const Icon = module.icon;
                return (
                  <div key={module.title} className="flex items-center gap-3 rounded-lg border border-dashed border-slate-700 bg-slate-900/40 px-3 py-3 text-sm text-slate-400">
                    <Icon className="h-4 w-4 text-slate-500" />
                    {module.title}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

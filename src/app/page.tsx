import Link from "next/link";
import {
  ArrowRight,
  ArrowRightLeft,
  Building2,
  CloudRain,
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
  Gauge,
  Leaf,
  Footprints,
  Users,
} from "lucide-react";

const modules = [
  {
    title: "บริการเมืองอยู่ใกล้พอไหม",
    subtitle: "การเข้าถึงบริการเมือง",
    description: "ตรวจว่าชุมชนเข้าถึงสุขภาพ การศึกษา ตลาด นันทนาการ และขนส่งสาธารณะได้ในระยะเดินที่เหมาะสมหรือไม่",
    href: "/accessibility",
    icon: Footprints,
    accent: "from-emerald-400 to-cyan-600",
    accentBg: "bg-emerald-500/10 border-emerald-500/20",
    accentText: "text-emerald-400",
    metric: "898 จุด",
    metricLabel: "5 หมวดบริการ",
    tag: "accessibility",
    source: "15-Minute City · Proximity",
    group: "people",
  },
  {
    title: "ประชากรและบ้านเรือนกระจุกที่ไหน",
    subtitle: "ประชากรเขตและแขวง",
    description: "ดูจำนวนประชากร บ้าน ความหนาแน่น และแนวโน้มรายเขต/แขวงเพื่อเทียบภาระบริการเมือง",
    href: "/population",
    icon: Users,
    accent: "from-indigo-400 to-violet-600",
    accentBg: "bg-indigo-500/10 border-indigo-500/20",
    accentText: "text-indigo-300",
    metric: "5.42M",
    metricLabel: "ทะเบียนราษฎร 2025",
    tag: "population",
    source: "Population Registry · DOPA",
    group: "people",
  },
  {
    title: "ปัญหาเมืองกำลังเกิดที่ไหน",
    subtitle: "เรื่องร้องเรียนและสถานะรับมือ",
    description: "ติดตามเรื่องร้องเรียนตามเขต ประเภทปัญหา สถานะ และแนวโน้มรายวันเพื่อจัดลำดับงานภาคสนาม",
    href: "/traffy",
    icon: ShieldAlert,
    accent: "from-orange-500 to-rose-500",
    accentBg: "bg-orange-500/10 border-orange-500/20",
    accentText: "text-orange-400",
    metric: "Traffy",
    metricLabel: "BigQuery Live",
    tag: "complaint",
    source: "Traffy Fondue",
    group: "events",
  },
  {
    title: "จุดร้อนเมืองอยู่ตรงไหน",
    subtitle: "เกาะความร้อนเมือง",
    description: "ค้นหาพื้นที่สะสมความร้อนรายเขต รายปี เพื่อคัดกรองพื้นที่ที่ควรเพิ่มร่มเงาหรือปรับผิวเมือง",
    href: "/heat-island",
    icon: Flame,
    accent: "from-amber-500 to-red-600",
    accentBg: "bg-amber-500/10 border-amber-500/20",
    accentText: "text-amber-400",
    metric: "°C",
    metricLabel: "Landsat 8/9",
    tag: "thermal",
    source: "Heat Island · LST",
    group: "environment",
  },
  {
    title: "เขตไหนมีร่มไม้พอแล้ว",
    subtitle: "เรือนยอดไม้ในเมือง",
    description: "ดูสัดส่วนและพื้นที่เรือนยอดไม้รายเขต พร้อมติดตามการเพิ่มและสูญเสียเทียบปีฐาน",
    href: "/green-space",
    icon: Trees,
    accent: "from-emerald-400 to-teal-600",
    accentBg: "bg-emerald-500/10 border-emerald-500/20",
    accentText: "text-emerald-400",
    metric: "Tree Cover",
    metricLabel: "Sentinel-2",
    tag: "vegetation",
    source: "Tree Cover · Dynamic World",
    group: "green",
  },
  {
    title: "พืชพรรณยังสมบูรณ์ไหม",
    subtitle: "ดัชนีพืชพรรณ NDVI",
    description: "ประเมินสภาพและความหนาแน่นของพืชพรรณ พร้อมแนวโน้มและผลต่างระหว่างปี",
    href: "/ndvi",
    icon: Leaf,
    accent: "from-lime-400 to-emerald-600",
    accentBg: "bg-lime-500/10 border-lime-500/20",
    accentText: "text-lime-400",
    metric: "NDVI",
    metricLabel: "Sentinel-2",
    tag: "vegetation-index",
    source: "Vegetation Condition · Sentinel-2",
    group: "green",
  },
  {
    title: "สิ่งปลูกสร้างขยายไปทางไหน",
    subtitle: "การขยายตัวของเมือง",
    description: "ดูสัดส่วนพื้นที่สิ่งปลูกสร้าง การเพิ่มและลด รวมถึงพื้นที่สีเขียวที่เปลี่ยนเป็นเมือง",
    href: "/urban-expansion",
    icon: Building2,
    accent: "from-indigo-500 to-purple-600",
    accentBg: "bg-indigo-500/10 border-indigo-500/20",
    accentText: "text-indigo-400",
    metric: "Built-up",
    metricLabel: "Sentinel-2",
    tag: "builtup",
    source: "Built-up Cover · Dynamic World",
    group: "green",
  },
  {
    title: "พื้นที่เปลี่ยนจากอะไรเป็นอะไร",
    subtitle: "การเปลี่ยนสิ่งปกคลุมดิน",
    description: "ติดตามพื้นที่สีเขียว สิ่งปลูกสร้าง น้ำ และการเปลี่ยนผ่านระหว่างปีในระดับเขต",
    href: "/land-cover-change",
    icon: ArrowRightLeft,
    accent: "from-lime-400 to-emerald-600",
    accentBg: "bg-lime-500/10 border-lime-500/20",
    accentText: "text-lime-400",
    metric: "LULC",
    metricLabel: "Dynamic World",
    tag: "landcover",
    source: "Land Cover Change · Dynamic World",
    group: "green",
  },
  {
    title: "ฝนสะสมมากผิดปกติหรือไม่",
    subtitle: "ปริมาณฝน",
    description: "ดูฝนสะสม 1-30 วัน แนวโน้มรายวัน การกระจายเชิงพื้นที่ และเทียบช่วงเดียวกันปีก่อน",
    href: "/rainfall",
    icon: CloudRain,
    accent: "from-blue-500 to-cyan-400",
    accentBg: "bg-blue-500/10 border-blue-500/20",
    accentText: "text-cyan-300",
    metric: "มม.",
    metricLabel: "GPM IMERG",
    tag: "rainfall",
    source: "Rainfall · GPM IMERG",
    group: "events",
  },
  {
    title: "มีสัญญาณน้ำขังตรงไหน",
    subtitle: "น้ำท่วม / แหล่งน้ำ",
    description: "ตรวจสัญญาณน้ำและความชื้นรายเขตเพื่อคัดกรองพื้นที่ที่ควรตรวจสอบต่อ",
    href: "/flood-risk",
    icon: Droplets,
    accent: "from-sky-500 to-cyan-500",
    accentBg: "bg-sky-500/10 border-sky-500/20",
    accentText: "text-sky-400",
    metric: "NDWI",
    metricLabel: "Sentinel-2",
    tag: "water",
    source: "Flood Risk · NDWI",
    group: "events",
  },
  {
    title: "กิจกรรมเมืองเปลี่ยนตรงไหน",
    subtitle: "แสงกลางคืน",
    description: "ดูความเข้มแสงกลางคืนรายปี ศูนย์กิจกรรมเมือง และแนวโน้มการเติบโตของพื้นที่ใช้งาน",
    href: "/nighttime-lights",
    icon: Moon,
    accent: "from-yellow-400 to-orange-500",
    accentBg: "bg-yellow-500/10 border-yellow-500/20",
    accentText: "text-yellow-400",
    metric: "nW/cm²",
    metricLabel: "VIIRS DNB",
    tag: "ntl",
    source: "Nighttime Lights · VIIRS",
    group: "environment",
  },
  {
    title: "คุณภาพอากาศเขตไหนน่าจับตา",
    subtitle: "มลพิษอากาศ",
    description: "ติดตาม NO2, CO, SO2 และ Aerosol รายเขต เพื่อดูแนวโน้มและพื้นที่ที่ควรเฝ้าระวัง",
    href: "/air-quality",
    icon: Wind,
    accent: "from-cyan-400 to-sky-600",
    accentBg: "bg-cyan-500/10 border-cyan-500/20",
    accentText: "text-cyan-400",
    metric: "NO₂",
    metricLabel: "Sentinel-5P",
    tag: "air",
    source: "Air Quality · Sentinel-5P",
    group: "environment",
  },
];

const workflowEntries = [
  {
    title: "จัดลำดับพื้นที่เสี่ยงก่อนลงพื้นที่",
    description: "รวมคะแนนน้ำท่วม ความร้อน เรื่องร้องเรียน และบริบทเขตเพื่อดูพื้นที่ที่ควรรับมือก่อน",
    href: "/decision-support",
    icon: Gauge,
    accent: "from-violet-500 to-orange-500",
    label: "เริ่มจากคะแนนคัดกรอง",
  },
  {
    title: "ดูภาพรวมรายเขตให้ครบก่อนตัดสินใจ",
    description: "เลือกเขตเดียวแล้วดูตัวชี้วัดหลักทั้งหมด พร้อมเทียบค่าเฉลี่ยกรุงเทพฯ และ export รายงาน",
    href: "/district-analysis",
    icon: FileSearch,
    accent: "from-cyan-400 to-blue-600",
    label: "เริ่มจากเขต",
  },
  {
    title: "ติดตามเหตุการณ์ล่าสุดและสัญญาณเตือน",
    description: "ตรวจเรื่องร้องเรียน ฝนสะสม และสัญญาณน้ำขัง เพื่อจับสถานการณ์ที่กำลังเปลี่ยน",
    href: "/traffy",
    icon: ShieldAlert,
    accent: "from-orange-500 to-rose-500",
    label: "ไปที่ Traffy ก่อน",
  },
  {
    title: "สำรวจชั้นข้อมูลดาวเทียมของพื้นที่",
    description: "ไล่ดูความร้อน น้ำ พืชพรรณ สิ่งปลูกสร้าง และสิ่งปกคลุมดินเพื่อหาหลักฐานเชิงพื้นที่",
    href: "/land-cover-change",
    icon: Satellite,
    accent: "from-emerald-400 to-sky-600",
    label: "เปิดชั้นข้อมูล",
  },
];

const guidanceSteps = [
  "เริ่มที่ภาพรวมรายเขต ถ้ายังไม่รู้พื้นที่เป้าหมาย",
  "ใช้ Decision Support เมื่อต้องจัดลำดับพื้นที่เสี่ยงหลายปัจจัย",
  "ตรวจสถานะข้อมูลท้ายหน้าเมื่อต้องอ้างอิงแหล่งข้อมูลหรือความสดของชั้นข้อมูล",
];

const moduleGroups = [
  {
    id: "people",
    title: "คนและบริการเมือง",
    description: "ประชากร ภาระบริการ และการเข้าถึงสิ่งจำเป็นของชีวิตประจำวัน",
  },
  {
    id: "events",
    title: "เหตุการณ์และการรับมือ",
    description: "สถานการณ์ที่เปลี่ยนเร็ว เช่น เรื่องร้องเรียน ฝน และสัญญาณน้ำขัง",
  },
  {
    id: "environment",
    title: "ความร้อนและสิ่งแวดล้อม",
    description: "ความร้อน แสงกลางคืน และมลพิษอากาศที่สะท้อนสภาพแวดล้อมเมือง",
  },
  {
    id: "green",
    title: "พื้นที่สีเขียวและสิ่งปกคลุมดิน",
    description: "ร่มไม้ พืชพรรณ สิ่งปลูกสร้าง และการเปลี่ยนแปลงของพื้นผิวเมือง",
  },
];

const platformStats = [
  { label: "โมดูลวิเคราะห์", value: "13", icon: BarChart3, color: "text-cyan-400" },
  { label: "เขต / แขวง", value: "50 / 180", icon: MapPin, color: "text-emerald-400" },
  { label: "ปีข้อมูล", value: "9 ปี", icon: Database, color: "text-amber-400" },
  { label: "ดาวเทียม", value: "5 ภารกิจ", icon: Satellite, color: "text-purple-400" },
];

const dataSources = [
  { src: "DOPA Registry", desc: "Population · houses · sex", color: "text-indigo-300" },
  { src: "Landsat 8/9", desc: "Land Surface Temp (LST)", color: "text-orange-400" },
  { src: "Sentinel-2 MSI", desc: "NDVI · NDBI · NDWI", color: "text-emerald-400" },
  { src: "Dynamic World", desc: "Land cover classes · change", color: "text-lime-400" },
  { src: "VIIRS DNB", desc: "Nighttime Lights annual", color: "text-yellow-400" },
  { src: "Sentinel-5P TROPOMI", desc: "NO₂ · CO · SO₂", color: "text-cyan-400" },
  { src: "GPM IMERG V07", desc: "Rainfall half-hourly", color: "text-blue-400" },
  { src: "Traffy Fondue", desc: "Complaint BigQuery", color: "text-rose-400" },
  { src: "GEE API", desc: "Live raster processing", color: "text-indigo-400" },
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
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">City Operations Workspace</div>
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
              <Map className="h-3.5 w-3.5" /> Workflow Entry
            </div>
            <h1 className="text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-[2.6rem]">
              ศูนย์วิเคราะห์งานเมือง
              <span className="ml-2 bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-transparent">กรุงเทพฯ</span>
            </h1>
            <p className="mt-2.5 max-w-2xl text-[13px] leading-7 text-slate-400">
              ทางเข้า workflow สำหรับเจ้าหน้าที่และนักวิเคราะห์กรุงเทพฯ เลือกเริ่มจากเขต พื้นที่เสี่ยง
              เหตุการณ์ล่าสุด หรือชั้นข้อมูลดาวเทียม แล้วค่อยลงรายละเอียดในโมดูลด้านล่าง
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

        {/* Workflow entry points */}
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">เริ่มจากงานที่ต้องทำ</h2>
            <div className="flex-1 h-px bg-slate-800" />
            <span className="hidden text-[10px] text-slate-600 sm:inline">เลือก workflow ก่อนเปิดโมดูลเฉพาะทาง</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {workflowEntries.map((entry) => {
              const Icon = entry.icon;
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className="group relative flex min-h-[154px] flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/75 p-5 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-500/70 hover:bg-slate-900/85 hover:shadow-2xl hover:shadow-black/30"
                >
                  <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${entry.accent} opacity-70 transition-opacity group-hover:opacity-100`} />
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${entry.accent} shadow-md`}>
                      <Icon className="h-5 w-5 text-white drop-shadow" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-cyan-300" />
                  </div>
                  <div className="text-[15px] font-black leading-snug text-white">{entry.title}</div>
                  <p className="mt-2 flex-1 text-[12px] leading-relaxed text-slate-400">{entry.description}</p>
                  <div className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{entry.label}</div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* First-run guidance */}
        <section className="mb-7 grid gap-3 rounded-2xl border border-slate-800/70 bg-slate-900/35 p-4 md:grid-cols-[auto_1fr] md:items-center">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">
            <Activity className="h-4 w-4" />
            แนะนำครั้งแรก
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {guidanceSteps.map((step, index) => (
              <div key={step} className="flex items-start gap-2 text-[12px] leading-relaxed text-slate-400">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/10 text-[10px] font-black text-cyan-300">
                  {index + 1}
                </span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Module cards */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">โมดูลวิเคราะห์ตามกลุ่มงาน</h2>
            <div className="flex-1 h-px bg-slate-800" />
            <span className="hidden text-[10px] text-slate-600 sm:inline">แหล่งข้อมูลและเทคนิคอยู่ในบรรทัดรองของแต่ละโมดูล</span>
          </div>

          <div className="space-y-7">
            {moduleGroups.map((group) => {
              const groupModules = modules.filter((mod) => mod.group === group.id);
              return (
                <div key={group.id}>
                  <div className="mb-3">
                    <h3 className="text-[16px] font-black text-white">{group.title}</h3>
                    <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{group.description}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {groupModules.map((mod) => {
                      const Icon = mod.icon;
                      return (
                        <Link
                          key={mod.href}
                          href={mod.href}
                          className="group relative flex min-h-[210px] flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/70 p-5 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-600/70 hover:bg-slate-900/80 hover:shadow-2xl hover:shadow-black/30"
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
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold ${mod.accentBg} ${mod.accentText}`}>
                                  {mod.metric}
                                </span>
                                <span className="text-[10px] text-slate-600">{mod.metricLabel}</span>
                              </div>
                              <div className="mt-1 truncate text-[10px] text-slate-700">{mod.source}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-slate-500 group-hover:text-cyan-400 transition-colors">
                              เปิด <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Data sources */}
        <section className="mt-8 rounded-2xl border border-slate-800/60 bg-slate-900/30 p-5">
          <div className="flex items-center gap-3 mb-4">
            <Database className="h-4 w-4 text-slate-500" />
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">สถานะข้อมูลและแหล่งอ้างอิง</h2>
            <div className="flex-1 h-px bg-slate-800" />
            <span className="hidden text-[10px] text-slate-600 sm:inline">ใช้เมื่อต้องตรวจความสดและที่มาของข้อมูล</span>
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3">
              <div className="text-[11px] font-bold text-emerald-300">ข้อมูลกึ่งสด</div>
              <div className="mt-1 text-[12px] leading-relaxed text-slate-500">Traffy, rainfall และ raster บางชั้นประมวลผลจากบริการต้นทางเมื่อเปิดโมดูล</div>
            </div>
            <div className="rounded-xl border border-cyan-500/15 bg-cyan-500/5 p-3">
              <div className="text-[11px] font-bold text-cyan-300">ข้อมูลรายปี/รายช่วงเวลา</div>
              <div className="mt-1 text-[12px] leading-relaxed text-slate-500">ประชากร ความร้อน เรือนยอดไม้ สิ่งปลูกสร้าง และแสงกลางคืนเหมาะกับการเทียบแนวโน้ม</div>
            </div>
            <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-3">
              <div className="text-[11px] font-bold text-amber-300">การตัดสินใจภาคสนาม</div>
              <div className="mt-1 text-[12px] leading-relaxed text-slate-500">ใช้ผลวิเคราะห์เป็นตัวคัดกรอง แล้วตรวจสอบกับข้อมูลพื้นที่และหน่วยงานเจ้าของข้อมูล</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
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

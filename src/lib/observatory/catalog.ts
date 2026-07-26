export type ObservatoryLensId =
  | "heat"
  | "vegetation"
  | "urban"
  | "water"
  | "people"
  | "air"
  | "activity";

export type BridgeMetric = "lst" | "vegetation" | "builtup" | "air_pollution";

export type ObservatoryLens = {
  id: ObservatoryLensId;
  title: string;
  shortTitle: string;
  question: string;
  description: string;
  phase: "mvp" | "phase-2";
  measurementType: "Satellite observation" | "Derived indicator" | "Administrative" | "Proxy";
  apiMetric?: BridgeMetric;
  valueKey?: string;
  unit: string;
  decimals: number;
  source: string;
  sourceId: string;
  resolution: string;
  cadence: string;
  method: string;
  limitation: string;
  verifyWith: string;
  ramp: string[];
};

export const OBSERVATORY_LENSES: ObservatoryLens[] = [
  {
    id: "heat",
    title: "ความร้อนผิวเมืองและการรับสัมผัส",
    shortTitle: "ความร้อนผิวเมือง",
    question: "พื้นที่ใดมีอุณหภูมิผิวดินต่างจากค่าปกติของฤดูกาล",
    description: "ตรวจอุณหภูมิผิวดิน แนวโน้ม และการกระจุกตัวของพื้นผิวร้อน พร้อมอ่านร่วมกับประชากรและพืชพรรณ",
    phase: "mvp",
    measurementType: "Satellite observation",
    apiMetric: "lst",
    valueKey: "mean_lst",
    unit: "°C",
    decimals: 1,
    source: "USGS Landsat 8/9 Collection 2 Level-2",
    sourceId: "LANDSAT/C02/T1_L2",
    resolution: "thermal 100 ม. (เผยแพร่บนกริด 30 ม.)",
    cadence: "ประมาณ 8 วันเมื่อรวม Landsat 8/9 ก่อนคัดเมฆ",
    method: "ใช้ Surface Temperature product, เปรียบเทียบช่วงฤดูกาลเดียวกัน และรายงาน valid clear-sky coverage",
    limitation: "เป็นอุณหภูมิผิวดินช่วงดาวเทียมผ่าน ไม่ใช่อุณหภูมิอากาศหรือ heat index",
    verifyWith: "สถานีอุตุนิยมวิทยา การใช้ที่ดิน ร่มเงา และการสำรวจภาคสนาม",
    ramp: [
      "oklch(0.92 0.04 82)",
      "oklch(0.82 0.10 72)",
      "oklch(0.70 0.16 55)",
      "oklch(0.57 0.19 38)",
      "oklch(0.43 0.15 25)",
    ],
  },
  {
    id: "vegetation",
    title: "สภาพพืชพรรณและพื้นที่เขียว-น้ำ",
    shortTitle: "สภาพพืชพรรณ",
    question: "สัญญาณความเขียวเปลี่ยนจากค่าปกติของฤดูกาลที่ใด",
    description: "ตรวจสภาพพืชพรรณ ความชื้น และความต่อเนื่องของพื้นที่เขียวโดยไม่ใช้ NDVI แทนเรือนยอดไม้",
    phase: "mvp",
    measurementType: "Derived indicator",
    apiMetric: "vegetation",
    valueKey: "ndvi_mean",
    unit: "NDVI",
    decimals: 3,
    source: "Copernicus Sentinel-2 Level-2A",
    sourceId: "COPERNICUS/S2_SR_HARMONIZED",
    resolution: "10–20 ม. ตาม band",
    cadence: "nominal 5 วันก่อนคัดเมฆ",
    method: "seasonal surface-reflectance composite, pixel QA และ observation count",
    limitation: "NDVI บ่งชี้ความเขียวและสภาพพืชพรรณ ไม่ใช่พื้นที่เรือนยอดไม้หรือความหลากหลายทางชีวภาพ",
    verifyWith: "tree-cover class, ขอบเขตสวน, ภาพความละเอียดสูง และการสำรวจพื้นที่",
    ramp: [
      "oklch(0.95 0.02 132)",
      "oklch(0.86 0.08 135)",
      "oklch(0.73 0.13 140)",
      "oklch(0.58 0.14 145)",
      "oklch(0.42 0.10 150)",
    ],
  },
  {
    id: "urban",
    title: "ผิวเมืองและการเปลี่ยนแปลงพื้นที่ก่อสร้าง",
    shortTitle: "การขยายตัวเมือง",
    question: "สัญญาณผิวสิ่งปลูกสร้างเพิ่มขึ้นต่อเนื่องที่ใด",
    description: "ติดตาม built-up spectral signal และ transition candidate โดยแยก land cover ออกจาก land use ตามกฎหมาย",
    phase: "mvp",
    measurementType: "Derived indicator",
    apiMetric: "builtup",
    valueKey: "ndbi_mean",
    unit: "NDBI",
    decimals: 3,
    source: "Copernicus Sentinel-2 + GHSL baseline",
    sourceId: "S2_L2A_GHSL",
    resolution: "10–20 ม.; GHSL baseline 100 ม.",
    cadence: "seasonal composite",
    method: "persistent spectral change หลาย acquisition และตรวจร่วมกับ land-cover probability",
    limitation: "NDBI ไม่ใช่แผนที่อาคาร ไม่ใช่ขอบเขตแปลง และไม่ยืนยันการเปลี่ยน land use",
    verifyWith: "ข้อมูลอาคาร ผังเมือง ภาพความละเอียดสูง และการตรวจพื้นที่",
    ramp: [
      "oklch(0.94 0.02 275)",
      "oklch(0.85 0.06 282)",
      "oklch(0.72 0.10 288)",
      "oklch(0.57 0.13 294)",
      "oklch(0.41 0.12 300)",
    ],
  },
  {
    id: "water",
    title: "ฝน น้ำ และสัญญาณน้ำบนผิว",
    shortTitle: "ฝนและน้ำ",
    question: "เหตุการณ์ฝนและสัญญาณน้ำบนผิวเกิดร่วมกันที่ใด",
    description: "เชื่อมสถานีฝนและระดับน้ำกับ IMERG, Sentinel-1 และ optical water signal",
    phase: "mvp",
    measurementType: "Satellite observation",
    unit: "มม. / สัญญาณ",
    decimals: 1,
    source: "BMA gauges + GPM IMERG + Sentinel-1",
    sourceId: "BMA_DDS_GPM_S1",
    resolution: "สถานี, 10 กม. และ 10 ม. ตามชนิดข้อมูล",
    cadence: "5 นาทีถึงรายเหตุการณ์",
    method: "event accumulation, antecedent 1/3/7 วัน และ pre/post SAR change",
    limitation: "เป็นสัญญาณคัดกรอง ไม่ใช่ความลึกน้ำ ขอบเขตน้ำท่วมทางการ หรือพยากรณ์",
    verifyWith: "สถานี BMA, GISTDA, ภาพภาคสนาม และข้อมูลการเดินระบบระบายน้ำ",
    ramp: [
      "oklch(0.95 0.02 225)",
      "oklch(0.86 0.07 230)",
      "oklch(0.73 0.12 235)",
      "oklch(0.58 0.15 242)",
      "oklch(0.42 0.13 250)",
    ],
  },
  {
    id: "people",
    title: "ประชากรและบริการเมืองในพื้นที่ที่พบสัญญาณ",
    shortTitle: "ประชากรและบริการ",
    question: "คนและทรัพย์สินใดอาจอยู่ในพื้นที่ที่พบสัญญาณ",
    description: "อ่านประชากรตามทะเบียนและประชากรแบบจำลองแยกกัน พร้อมตำแหน่งบริการเมืองที่ผ่านการตรวจแหล่งข้อมูล",
    phase: "mvp",
    measurementType: "Administrative",
    unit: "คน / แห่ง",
    decimals: 0,
    source: "DOPA + WorldPop + BMA Open Data",
    sourceId: "DOPA_WORLDPOP_BMA",
    resolution: "เขต/แขวง, 100 ม. และจุดบริการ",
    cadence: "รายเดือนถึงรายปีตามชุดข้อมูล",
    method: "spatial overlay โดยรักษาประเภทการวัดและช่วงเวลาแยกกัน",
    limitation: "ประชากรตามทะเบียนไม่เท่ากับประชากรที่อยู่จริง และ WorldPop เป็นแบบจำลองระดับกริด",
    verifyWith: "NSO, ข้อมูลบริการของหน่วยงานเจ้าของ และการสำรวจความต้องการจริง",
    ramp: [
      "oklch(0.95 0.02 300)",
      "oklch(0.87 0.05 300)",
      "oklch(0.75 0.09 298)",
      "oklch(0.60 0.12 296)",
      "oklch(0.44 0.12 294)",
    ],
  },
  {
    id: "air",
    title: "บรรยากาศและตัวชี้วัดมลพิษจากดาวเทียม",
    shortTitle: "บรรยากาศ",
    question: "ตัวชี้วัดมลพิษจากดาวเทียมสัมพันธ์กับสถานีและอุตุนิยมวิทยาอย่างไร",
    description: "หัวข้อระยะถัดไป ต้อง cross-validate TROPOMI/MAIAC กับสถานีภาคพื้นก่อนใช้งานเชิงปฏิบัติการ",
    phase: "phase-2",
    measurementType: "Proxy",
    unit: "ตาม product",
    decimals: 4,
    source: "Sentinel-5P + MAIAC + ground stations",
    sourceId: "S5P_MAIAC_GROUND",
    resolution: "ประมาณ 1–5.5 กม. ตาม product",
    cadence: "รายวันก่อน QA และ aggregation",
    method: "spatial-temporal cross-validation ร่วมกับ ERA5 meteorology",
    limitation: "atmospheric column และ AOD ไม่ใช่ AQI หรือ PM2.5 ระดับถนน",
    verifyWith: "สถานีที่ผ่าน QA, อุตุนิยมวิทยา และการตรวจ calibration",
    ramp: [
      "oklch(0.95 0.02 185)",
      "oklch(0.86 0.06 185)",
      "oklch(0.73 0.10 175)",
      "oklch(0.59 0.12 160)",
      "oklch(0.43 0.10 145)",
    ],
  },
  {
    id: "activity",
    title: "แสงกลางคืนและสัญญาณกิจกรรมเมือง",
    shortTitle: "กิจกรรมเมือง",
    question: "สัญญาณแสงกลางคืนเปลี่ยนอย่างต่อเนื่องที่ใด",
    description: "หัวข้อระยะถัดไปสำหรับอ่านกิจกรรมและแสง ไม่ใช้แทน GDP รายได้ หรือจำนวนประชากร",
    phase: "phase-2",
    measurementType: "Proxy",
    unit: "nW/sr/cm²",
    decimals: 1,
    source: "NASA Black Marble / VIIRS DNB",
    sourceId: "VIIRS_BLACK_MARBLE",
    resolution: "ประมาณ 500 ม.",
    cadence: "รายเดือน/รายปี",
    method: "monthly or annual composite พร้อม stray-light และ cloud QA",
    limitation: "เป็นสัญญาณแสงและกิจกรรม ไม่ยืนยันเศรษฐกิจ รายได้ หรือความมั่งคั่ง",
    verifyWith: "การใช้ที่ดิน สถานประกอบการ พลังงาน และข้อมูลสำรวจ",
    ramp: [
      "oklch(0.92 0.03 95)",
      "oklch(0.83 0.09 90)",
      "oklch(0.72 0.14 82)",
      "oklch(0.58 0.15 70)",
      "oklch(0.42 0.12 58)",
    ],
  },
];

export type DatasetReadiness = "provisional" | "acceptance" | "research";

export type ObservatoryDataset = {
  id: string;
  name: string;
  owner: string;
  role: string;
  type: "Observed" | "Administrative" | "Model-derived" | "Proxy";
  spatial: string;
  temporal: string;
  readiness: DatasetReadiness;
  license: string;
  url: string;
  caveat: string;
};

export const OBSERVATORY_DATASETS: ObservatoryDataset[] = [
  {
    id: "sentinel-2-l2a",
    name: "Sentinel-2 Level-2A",
    owner: "Copernicus / ESA",
    role: "พืชพรรณ ความชื้น น้ำ และผิวเมือง",
    type: "Observed",
    spatial: "10 / 20 / 60 ม.",
    temporal: "nominal 5 วัน",
    readiness: "provisional",
    license: "Free, full and open; ตรวจเงื่อนไข attribution ก่อน export",
    url: "https://documentation.dataspace.copernicus.eu/Data/SentinelMissions/Sentinel2.html",
    caveat: "ต้องใช้ cloud, shadow และ aerosol QA พร้อมจำนวน observation",
  },
  {
    id: "sentinel-1-grd",
    name: "Sentinel-1 GRD",
    owner: "Copernicus / ESA",
    role: "สัญญาณน้ำ ความเปียก และ pre/post event",
    type: "Observed",
    spatial: "pixel spacing โดยทั่วไป 10 ม.",
    temporal: "nominal 6 วันตาม constellation",
    readiness: "acceptance",
    license: "Copernicus free, full and open",
    url: "https://sentinels.copernicus.eu/documents/247904/1653440/Sentinel-1_Data_Access_and_Products",
    caveat: "ต้องควบคุม orbit direction, speckle, terrain และ baseline",
  },
  {
    id: "landsat-c2-l2",
    name: "Landsat 8/9 Collection 2 Level-2",
    owner: "USGS / NASA",
    role: "อุณหภูมิผิวดินและแนวโน้มระยะยาว",
    type: "Observed",
    spatial: "thermal 100 ม. บนกริด 30 ม.",
    temporal: "ประมาณ 8 วันเมื่อรวมสองดวง",
    readiness: "provisional",
    license: "No restriction; ต้อง cite product",
    url: "https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products",
    caveat: "clear-sky daytime overpass และต้องใช้ pixel QA",
  },
  {
    id: "gpm-imerg",
    name: "GPM IMERG",
    owner: "NASA / JAXA",
    role: "บริบทฝนระดับเมืองและเหตุการณ์",
    type: "Model-derived",
    spatial: "0.1° หรือประมาณ 10 กม.",
    temporal: "ทุก 30 นาที",
    readiness: "provisional",
    license: "NASA open data; cite dataset/version",
    url: "https://gpm.nasa.gov/resources/documents/imerg-v07-technical-documentation",
    caveat: "ห้ามแสดงเสมือนมีความละเอียดระดับถนนหรือสถานี",
  },
  {
    id: "bma-open-data",
    name: "Bangkok Open Data",
    owner: "กรุงเทพมหานคร",
    role: "ขอบเขต ระบายน้ำ ถนน สวน การศึกษา สุขภาพ และบริการเมือง",
    type: "Administrative",
    spatial: "แตกต่างตาม resource",
    temporal: "แตกต่างและไม่สม่ำเสมอ",
    readiness: "acceptance",
    license: "ต้องตรวจระดับ resource",
    url: "https://opendata.bangkok.go.th/",
    caveat: "ต้อง audit endpoint, freshness, code list และสิทธิ redistribution ทีละชุด",
  },
  {
    id: "dopa-population",
    name: "DOPA Population Registry",
    owner: "กรมการปกครอง",
    role: "ประชากรตามทะเบียนและบ้าน",
    type: "Administrative",
    spatial: "เขต/แขวงตามตารางเผยแพร่",
    temporal: "รายเดือน",
    readiness: "provisional",
    license: "ตรวจเงื่อนไขการนำกลับมาเผยแพร่",
    url: "https://stat.bora.dopa.go.th/stat/statnew/statMONTH/statmonth/",
    caveat: "ไม่ใช่ประชากรที่อยู่จริงกลางวัน/กลางคืน",
  },
  {
    id: "worldpop",
    name: "WorldPop",
    owner: "WorldPop",
    role: "กระจายประชากรแบบจำลองสำหรับ exposure",
    type: "Model-derived",
    spatial: "ประมาณ 100 ม.",
    temporal: "รายปีตาม product",
    readiness: "acceptance",
    license: "CC BY 4.0 ตาม product",
    url: "https://www.worldpop.org/",
    caveat: "ไม่ใช่การนับคนจริงระดับ pixel และต้องไม่หลอมกับ DOPA",
  },
  {
    id: "sentinel-5p",
    name: "Sentinel-5P TROPOMI",
    owner: "Copernicus / ESA",
    role: "atmospheric-column pollution proxy",
    type: "Proxy",
    spatial: "ประมาณ 3.5 × 5.5 กม.",
    temporal: "รายวัน",
    readiness: "research",
    license: "Copernicus free, full and open",
    url: "https://sentinels.copernicus.eu/data-products",
    caveat: "ไม่ใช่ AQI ระดับถนน ต้องใช้ qa_value และ cross-validation กับสถานี",
  },
];

export const DEFAULT_LENS_ID: ObservatoryLensId = "heat";

export function getObservatoryLens(id?: string | null) {
  return OBSERVATORY_LENSES.find((lens) => lens.id === id) ??
    OBSERVATORY_LENSES.find((lens) => lens.id === DEFAULT_LENS_ID)!;
}

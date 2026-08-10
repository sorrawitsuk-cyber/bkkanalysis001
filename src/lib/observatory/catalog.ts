export type ObservatoryLensId =
  | "heat"
  | "vegetation"
  | "urban"
  | "water"
  | "people"
  | "air"
  | "activity";

export type BridgeMetric =
  | "lst"
  | "vegetation"
  | "builtup"
  | "water"
  | "population"
  | "air_pollution"
  | "nightlights";
export type GeeMetric =
  | "lst"
  | "vegetation"
  | "builtup"
  | "air_pollution"
  | "nightlights"
  | "mndwi";
export type ObservatoryDataEndpoint =
  | "district-metrics"
  | "flood-risk"
  | "population"
  | "nighttime-lights";

export type ObservatoryLens = {
  id: ObservatoryLensId;
  title: string;
  shortTitle: string;
  question: string;
  description: string;
  phase: "mvp" | "phase-2";
  measurementType: "Satellite observation" | "Derived indicator" | "Administrative" | "Proxy";
  apiMetric?: BridgeMetric;
  apiEndpoint?: ObservatoryDataEndpoint;
  geeMetric?: GeeMetric;
  valueKey?: string;
  deltaKey?: string;
  minYear: number;
  maxYear?: number;
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
    apiEndpoint: "district-metrics",
    geeMetric: "lst",
    valueKey: "mean_lst",
    deltaKey: "delta",
    minYear: 2015,
    unit: "°C",
    decimals: 1,
    source: "ภาพสำรวจ Landsat 8/9 จาก USGS",
    sourceId: "LANDSAT/C02/T1_L2",
    resolution: "เหมาะสำหรับดูระดับเขต ไม่ใช่รายแปลง",
    cadence: "เก็บภาพได้เป็นช่วง ๆ และคัดวันที่เมฆรบกวนน้อย",
    method: "อ่านอุณหภูมิผิวดินจากภาพสำรวจ แล้วเทียบกับช่วงฤดูกาลเดียวกัน",
    limitation: "เป็นอุณหภูมิผิวดินช่วงดาวเทียมผ่าน ไม่ใช่อุณหภูมิอากาศหรือดัชนีความร้อน",
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
    description: "ตรวจสภาพพืชพรรณ ความชื้น และความต่อเนื่องของพื้นที่เขียว โดยไม่ใช้ค่าความเขียวแทนเรือนยอดไม้",
    phase: "mvp",
    measurementType: "Derived indicator",
    apiMetric: "vegetation",
    apiEndpoint: "district-metrics",
    geeMetric: "vegetation",
    valueKey: "ndvi_mean",
    deltaKey: "delta",
    minYear: 2017,
    unit: "ค่าความเขียว",
    decimals: 3,
    source: "ภาพสำรวจ Sentinel-2 จาก Copernicus",
    sourceId: "COPERNICUS/S2_SR_HARMONIZED",
    resolution: "เหมาะสำหรับดูระดับพื้นที่และระดับเขต",
    cadence: "เก็บภาพได้บ่อย แต่ต้องคัดภาพที่เมฆรบกวนน้อย",
    method: "รวมภาพฤดูกาลเดียวกัน แล้วสรุปเป็นสัญญาณความเขียวของแต่ละพื้นที่",
    limitation: "ค่านี้บ่งชี้ความเขียวและสภาพพืชพรรณ ไม่ใช่พื้นที่เรือนยอดไม้หรือความหลากหลายทางชีวภาพ",
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
    description: "ติดตามสัญญาณพื้นผิวสิ่งปลูกสร้าง และแยกสิ่งที่เห็นจากภาพสำรวจออกจากการใช้ประโยชน์ที่ดินตามกฎหมาย",
    phase: "mvp",
    measurementType: "Derived indicator",
    apiMetric: "builtup",
    apiEndpoint: "district-metrics",
    geeMetric: "builtup",
    valueKey: "ndbi_mean",
    deltaKey: "delta",
    minYear: 2017,
    unit: "สัญญาณผิวเมือง",
    decimals: 3,
    source: "Sentinel-2 ร่วมกับข้อมูลสิ่งปลูกสร้างอ้างอิง",
    sourceId: "S2_L2A_GHSL",
    resolution: "เหมาะสำหรับอ่านภาพรวมระดับพื้นที่ ไม่ใช่ขอบเขตอาคาร",
    cadence: "สรุปตามฤดูกาล",
    method: "ดูการเปลี่ยนแปลงที่เกิดซ้ำในหลายภาพ และอ่านร่วมกับชนิดสิ่งปกคลุมดิน",
    limitation: "สัญญาณผิวเมืองไม่ใช่แผนที่อาคาร ไม่ใช่ขอบเขตแปลง และไม่ยืนยันการเปลี่ยนการใช้ที่ดิน",
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
    description: "เชื่อมข้อมูลฝนและระดับน้ำกับภาพสำรวจ เพื่อดูสัญญาณน้ำบนผิวดิน",
    phase: "mvp",
    measurementType: "Satellite observation",
    apiMetric: "water",
    apiEndpoint: "flood-risk",
    geeMetric: "mndwi",
    valueKey: "mndwi_mean",
    deltaKey: "delta",
    minYear: 2017,
    unit: "ดัชนี MNDWI",
    decimals: 3,
    source: "ข้อมูลฝนของกรุงเทพฯ ร่วมกับภาพสำรวจดาวเทียม",
    sourceId: "BMA_DDS_GPM_S1",
    resolution: "ความละเอียดต่างกันตามชนิดข้อมูล เหมาะสำหรับคัดกรองพื้นที่",
    cadence: "5 นาทีถึงรายเหตุการณ์",
    method: "ดูฝนสะสมก่อนเหตุการณ์ ร่วมกับภาพก่อนและหลังช่วงที่เกิดสัญญาณน้ำ",
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
    apiMetric: "population",
    apiEndpoint: "population",
    valueKey: "population",
    deltaKey: "change_abs",
    minYear: 2018,
    maxYear: 2025,
    unit: "คน",
    decimals: 0,
    source: "ข้อมูลทะเบียนประชากร แบบจำลองประชากร และข้อมูลเปิดกรุงเทพฯ",
    sourceId: "DOPA_WORLDPOP_BMA",
    resolution: "เขต แขวง และตำแหน่งบริการเมือง",
    cadence: "รายเดือนถึงรายปีตามชุดข้อมูล",
    method: "ซ้อนข้อมูลพื้นที่โดยไม่รวมข้อมูลคนละชนิดให้เป็นตัวเลขเดียว",
    limitation: "ประชากรตามทะเบียนไม่เท่ากับประชากรที่อยู่จริง และข้อมูลกระจายประชากรเป็นแบบจำลองระดับพื้นที่",
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
    description: "หัวข้อระยะถัดไป ต้องตรวจเทียบกับสถานีภาคพื้นก่อนใช้งานเชิงปฏิบัติการ",
    phase: "phase-2",
    measurementType: "Proxy",
    apiMetric: "air_pollution",
    apiEndpoint: "district-metrics",
    geeMetric: "air_pollution",
    valueKey: "no2_mean",
    deltaKey: "delta",
    minYear: 2018,
    unit: "ตามชนิดข้อมูล",
    decimals: 4,
    source: "ภาพสำรวจบรรยากาศร่วมกับสถานีภาคพื้น",
    sourceId: "S5P_MAIAC_GROUND",
    resolution: "เหมาะสำหรับภาพรวมเมือง ไม่ใช่รายถนน",
    cadence: "รายวันก่อนสรุปเป็นช่วงเวลา",
    method: "ตรวจเทียบพื้นที่และช่วงเวลากับสถานีและข้อมูลอากาศ",
    limitation: "เป็นสัญญาณบรรยากาศจากดาวเทียม ไม่ใช่ AQI หรือ PM2.5 ระดับถนน",
    verifyWith: "สถานีตรวจวัดที่ผ่านการตรวจคุณภาพ อุตุนิยมวิทยา และการสอบเทียบ",
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
    apiMetric: "nightlights",
    apiEndpoint: "nighttime-lights",
    geeMetric: "nightlights",
    valueKey: "ntl_mean",
    deltaKey: "ntl_delta",
    minYear: 2014,
    maxYear: 2024,
    unit: "nW/sr/cm²",
    decimals: 1,
    source: "ภาพแสงกลางคืนจาก NASA",
    sourceId: "VIIRS_BLACK_MARBLE",
    resolution: "ประมาณ 500 ม.",
    cadence: "รายเดือน/รายปี",
    method: "รวมภาพรายเดือนหรือรายปี และคัดภาพที่ถูกรบกวนออก",
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
    temporal: "ประมาณทุก 5 วันก่อนคัดภาพรบกวน",
    readiness: "provisional",
    license: "เปิดให้ใช้ตามเงื่อนไข และต้องตรวจวิธีอ้างอิงก่อนส่งออก",
    url: "https://documentation.dataspace.copernicus.eu/Data/SentinelMissions/Sentinel2.html",
    caveat: "ต้องคัดภาพที่มีเมฆ เงา หรือฝุ่นรบกวน และดูจำนวนภาพที่ใช้ประกอบ",
  },
  {
    id: "sentinel-1-grd",
    name: "Sentinel-1 GRD",
    owner: "Copernicus / ESA",
    role: "สัญญาณน้ำ ความเปียก และภาพก่อน/หลังเหตุการณ์",
    type: "Observed",
    spatial: "โดยทั่วไปประมาณ 10 ม.",
    temporal: "ประมาณทุก 6 วันตามรอบดาวเทียม",
    readiness: "acceptance",
    license: "เปิดให้ใช้ตามเงื่อนไขของ Copernicus",
    url: "https://sentinels.copernicus.eu/documents/247904/1653440/Sentinel-1_Data_Access_and_Products",
    caveat: "ต้องคุมรอบการเก็บภาพ สัญญาณรบกวน สภาพภูมิประเทศ และปีอ้างอิง",
  },
  {
    id: "landsat-c2-l2",
    name: "Landsat 8/9 Collection 2 Level-2",
    owner: "USGS / NASA",
    role: "อุณหภูมิผิวดินและแนวโน้มระยะยาว",
    type: "Observed",
    spatial: "เหมาะสำหรับดูระดับเขต ไม่ใช่รายแปลง",
    temporal: "ประมาณ 8 วันเมื่อรวมสองดวง",
    readiness: "provisional",
    license: "ใช้ได้ตามเงื่อนไข และต้องอ้างอิงแหล่งข้อมูล",
    url: "https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products",
    caveat: "เป็นภาพช่วงกลางวันที่เมฆรบกวนน้อย และต้องตรวจคุณภาพภาพก่อนอ่านผล",
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
    license: "ข้อมูลเปิดจาก NASA และต้องอ้างอิงชุดข้อมูล",
    url: "https://gpm.nasa.gov/resources/documents/imerg-v07-technical-documentation",
    caveat: "ห้ามแสดงเสมือนมีความละเอียดระดับถนนหรือสถานี",
  },
  {
    id: "bma-open-data",
    name: "Bangkok Open Data",
    owner: "กรุงเทพมหานคร",
    role: "ขอบเขต ระบายน้ำ ถนน สวน การศึกษา สุขภาพ และบริการเมือง",
    type: "Administrative",
    spatial: "แตกต่างตามชุดข้อมูล",
    temporal: "แตกต่างและไม่สม่ำเสมอ",
    readiness: "acceptance",
    license: "ต้องตรวจสิทธิการใช้ทีละชุดข้อมูล",
    url: "https://opendata.bangkok.go.th/",
    caveat: "ต้องตรวจช่องทางข้อมูล ความใหม่ รหัสอ้างอิง และสิทธิการเผยแพร่ซ้ำทีละชุด",
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
    role: "กระจายประชากรแบบจำลองสำหรับดูพื้นที่ที่อาจได้รับผล",
    type: "Model-derived",
    spatial: "ประมาณ 100 ม.",
    temporal: "รายปีตามชุดข้อมูล",
    readiness: "acceptance",
    license: "CC BY 4.0 ตามเงื่อนไขชุดข้อมูล",
    url: "https://www.worldpop.org/",
    caveat: "ไม่ใช่การนับคนจริงรายจุด และต้องไม่รวมปนกับข้อมูลทะเบียนประชากร",
  },
  {
    id: "sentinel-5p",
    name: "Sentinel-5P TROPOMI",
    owner: "Copernicus / ESA",
    role: "สัญญาณมลพิษในบรรยากาศจากดาวเทียม",
    type: "Proxy",
    spatial: "ประมาณ 3.5 × 5.5 กม.",
    temporal: "รายวัน",
    readiness: "research",
    license: "เปิดให้ใช้ตามเงื่อนไขของ Copernicus",
    url: "https://sentinels.copernicus.eu/data-products",
    caveat: "ไม่ใช่ AQI ระดับถนน และต้องตรวจเทียบกับสถานีภาคพื้น",
  },
];

export const DEFAULT_LENS_ID: ObservatoryLensId = "heat";

export function getObservatoryLens(id?: string | null) {
  return OBSERVATORY_LENSES.find((lens) => lens.id === id) ??
    OBSERVATORY_LENSES.find((lens) => lens.id === DEFAULT_LENS_ID)!;
}

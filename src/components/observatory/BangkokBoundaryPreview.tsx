import districtGeoJson from "@/data/observatory/bkk-districts.provisional.json";

type Point = [number, number];
type Geometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};

const WIDTH = 900;
const HEIGHT = 520;
const PADDING = 24;

function ringsForGeometry(geometry: Geometry): number[][][] {
  return geometry.type === "Polygon"
    ? geometry.coordinates as number[][][]
    : (geometry.coordinates as number[][][][]).flat();
}

const features = districtGeoJson.features as Array<{
  properties: { areaCode: string; nameTh: string };
  geometry: Geometry;
}>;

const allPoints = features.flatMap((feature) => ringsForGeometry(feature.geometry).flat()) as Point[];
const minX = Math.min(...allPoints.map(([x]) => x));
const maxX = Math.max(...allPoints.map(([x]) => x));
const minY = Math.min(...allPoints.map(([, y]) => y));
const maxY = Math.max(...allPoints.map(([, y]) => y));
const scale = Math.min(
  (WIDTH - PADDING * 2) / (maxX - minX),
  (HEIGHT - PADDING * 2) / (maxY - minY),
);

function project([x, y]: Point) {
  const projectedWidth = (maxX - minX) * scale;
  const projectedHeight = (maxY - minY) * scale;
  const offsetX = (WIDTH - projectedWidth) / 2;
  const offsetY = (HEIGHT - projectedHeight) / 2;
  return [
    offsetX + (x - minX) * scale,
    HEIGHT - (offsetY + (y - minY) * scale),
  ];
}

function pathForGeometry(geometry: Geometry) {
  return ringsForGeometry(geometry)
    .map((ring) =>
      ring
        .map((point, index) => {
          const [x, y] = project(point as Point);
          return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ") + " Z",
    )
    .join(" ");
}

export default function BangkokBoundaryPreview() {
  return (
    <figure className="relative min-h-[380px] overflow-hidden rounded-[var(--radius-panel)] border border-[var(--oe-line)] bg-[var(--oe-map-canvas)] p-4">
      <figcaption className="absolute left-5 top-5 z-10 max-w-[300px] rounded-[var(--radius-control)] bg-white/95 px-3 py-2 text-sm">
        <span className="block font-bold">ขอบเขตพื้นที่ศึกษา 50 เขต</span>
        <span className="mt-0.5 block text-xs leading-5 text-[var(--oe-muted)]">
          แสดง geometry เพื่อเริ่มเลือกพื้นที่ ไม่ได้ใช้สีแทนค่าตัวชี้วัด
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="แผนที่ขอบเขต 50 เขตของกรุงเทพมหานคร"
        className="h-full min-h-[350px] w-full"
      >
        {features.map((feature, index) => (
          <path
            key={feature.properties.areaCode}
            d={pathForGeometry(feature.geometry)}
            fill={index % 3 === 0 ? "var(--oe-map-fill-a)" : index % 3 === 1 ? "var(--oe-map-fill-b)" : "var(--oe-map-fill-c)"}
            stroke="var(--oe-map-stroke)"
            strokeWidth="0.9"
            vectorEffect="non-scaling-stroke"
          >
            <title>{feature.properties.nameTh}</title>
          </path>
        ))}
      </svg>
      <div className="absolute bottom-4 left-4 rounded-[var(--radius-control)] bg-white/95 px-3 py-2 text-xs text-[var(--oe-muted)]">
        Geometry อยู่ระหว่างจัดทำ canonical area code และตรวจรุ่นขอบเขต
      </div>
    </figure>
  );
}

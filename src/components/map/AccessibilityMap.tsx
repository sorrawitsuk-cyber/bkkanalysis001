/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ACCESSIBILITY_LABELS,
  ACCESSIBILITY_SUBTYPE_LABELS,
  accessibilityColor,
  accessibilityLevel,
  accessibilityValue,
  type AccessibilityBasis,
  type AccessibilityCategory,
  type AccessibilityDistrict,
  type AccessibilityMetric,
  type AccessibilityScenario,
  type AccessibilityService,
} from "@/lib/accessibility";

const SERVICE_COLORS: Record<AccessibilityCategory, string> = {
  health: "#ef4444",
  education: "#3b82f6",
  food: "#f59e0b",
  recreation: "#22c55e",
  transit: "#a855f7",
};

const BASEMAPS = {
  dark: {
    label: "แผนที่มืด",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  },
  light: {
    label: "แผนที่สว่าง",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  },
  satellite: {
    label: "ภาพถ่ายดาวเทียม",
    attribution: "Tiles &copy; Esri",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  },
} as const;

type BasemapKey = keyof typeof BASEMAPS;

interface AccessibilityMapProps {
  geojson: any;
  districts: AccessibilityDistrict[];
  services: AccessibilityService[];
  metric: AccessibilityMetric;
  basis: AccessibilityBasis;
  scenario: AccessibilityScenario;
  category: AccessibilityCategory | "all";
  serviceSubtype: string;
  activeDistrictId: number | null;
  selectedServiceId: string | null;
  showServices: boolean;
  onSelectDistrict: (district: AccessibilityDistrict) => void;
  onSelectService: (service: AccessibilityService | null) => void;
}

function FitBounds({
  geojson,
  districtId,
  resetToken,
}: {
  geojson: any;
  districtId: number | null;
  resetToken: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!geojson) return;
    const selected = districtId
      ? {
          type: "FeatureCollection",
          features: geojson.features.filter(
            (feature: any) => feature.properties?.id === districtId,
          ),
        }
      : geojson;
    const bounds = L.geoJSON(selected).getBounds();
    if (bounds.isValid()) {
      map.flyToBounds(bounds, {
        padding: [32, 32],
        duration: resetToken ? 0.25 : 0.45,
        maxZoom: districtId ? 13 : 11,
      });
    }
  }, [districtId, geojson, map, resetToken]);
  return null;
}

export default function AccessibilityMap({
  geojson,
  districts,
  services,
  metric,
  basis,
  scenario,
  category,
  serviceSubtype,
  activeDistrictId,
  selectedServiceId,
  showServices,
  onSelectDistrict,
  onSelectService,
}: AccessibilityMapProps) {
  const [basemap, setBasemap] = useState<BasemapKey>("dark");
  const [resetToken, setResetToken] = useState(0);
  const rowById = useMemo(
    () => new Map(districts.map((district) => [district.district_id, district])),
    [districts],
  );
  const rankById = useMemo(
    () =>
      new Map(
        [...districts]
          .sort(
            (a, b) =>
              accessibilityValue(b, metric, basis, scenario) -
              accessibilityValue(a, metric, basis, scenario),
          )
          .map((district, index) => [district.district_id, index + 1]),
      ),
    [basis, districts, metric, scenario],
  );
  const visibleServices = useMemo(
    () =>
      services.filter(
        (service) =>
          (category === "all" || service.category === category) &&
          (serviceSubtype === "all" || service.subtype === serviceSubtype) &&
          (!activeDistrictId || service.district_id === activeDistrictId),
      ),
    [activeDistrictId, category, serviceSubtype, services],
  );
  const metricLabel =
    metric === "accessibility_score"
      ? "เฉลี่ย 5 หมวด"
      : metric === "complete_coverage_pct"
        ? "ครบทั้ง 5 หมวด"
        : ACCESSIBILITY_LABELS[metric];
  const basisLabel = basis === "population" ? "ประชากรโดยประมาณ" : "พื้นที่";
  const scenarioLabel =
    scenario === "standard"
      ? "เดิน 5 กม./ชม."
      : scenario === "inclusive"
        ? "เดิน 4 กม./ชม."
        : "จักรยาน 15 กม./ชม.";
  const tile = BASEMAPS[basemap];

  return (
    <MapContainer
      center={[13.7563, 100.5018]}
      zoom={10}
      zoomControl={false}
      preferCanvas
      className="h-full w-full bg-slate-950"
      attributionControl
    >
      <ZoomControl position="bottomright" />
      <TileLayer key={basemap} attribution={tile.attribution} url={tile.url} />
      <GeoJSON
        key={`${metric}-${basis}-${scenario}-${activeDistrictId ?? "all"}`}
        data={geojson}
        style={(feature) => {
          const district = rowById.get(Number(feature?.properties?.id));
          const value = district
            ? accessibilityValue(district, metric, basis, scenario)
            : 0;
          const active = !activeDistrictId || activeDistrictId === district?.district_id;
          return {
            color: activeDistrictId === district?.district_id ? "#ffffff" : "#64748b",
            weight: activeDistrictId === district?.district_id ? 2.5 : 0.8,
            fillColor: accessibilityColor(value),
            fillOpacity: active ? 0.74 : 0.13,
          };
        }}
        onEachFeature={(feature, layer) => {
          const district = rowById.get(Number(feature.properties?.id));
          if (!district) return;
          const value = accessibilityValue(district, metric, basis, scenario);
          const rank = rankById.get(district.district_id);
          layer.bindTooltip(
            `<strong>เขต${district.district_name}</strong><br/>${metricLabel}: <strong>${value.toFixed(1)}%</strong><br/>ฐาน: ${basisLabel}<br/>${scenarioLabel}<br/>${accessibilityLevel(value)} · อันดับ ${rank}/50`,
            { sticky: true, direction: "top" },
          );
          layer.on({
            click: () => onSelectDistrict(district),
            mouseover: () => {
              (layer as L.Path).setStyle({ weight: 2.5, color: "#f8fafc", fillOpacity: 0.88 });
              (layer as L.Path).bringToFront();
            },
            mouseout: () => {
              const active = !activeDistrictId || activeDistrictId === district.district_id;
              (layer as L.Path).setStyle({
                color: activeDistrictId === district.district_id ? "#ffffff" : "#64748b",
                weight: activeDistrictId === district.district_id ? 2.5 : 0.8,
                fillColor: accessibilityColor(value),
                fillOpacity: active ? 0.74 : 0.13,
              });
            },
          });
        }}
      />
      {showServices &&
        visibleServices.map((service) => {
          const selected = service.id === selectedServiceId;
          return (
            <CircleMarker
              key={service.id}
              center={[service.lat, service.lng]}
              radius={selected ? 8 : 4.5}
              eventHandlers={{
                click: () => onSelectService(service),
              }}
              pathOptions={{
                color: selected ? "#ffffff" : "#e2e8f0",
                weight: selected ? 2.5 : 0.7,
                fillColor: SERVICE_COLORS[service.category],
                fillOpacity: selected ? 1 : 0.88,
              }}
            >
              <Tooltip direction="top">
                <strong>{service.name}</strong>
                <br />
                {ACCESSIBILITY_LABELS[service.category]}
                <br />
                {ACCESSIBILITY_SUBTYPE_LABELS[service.subtype] ?? service.subtype}
                <br />
                <span>เขต{service.district_name ?? "ไม่ทราบเขต"}</span>
              </Tooltip>
            </CircleMarker>
          );
        })}
      <FitBounds
        geojson={geojson}
        districtId={activeDistrictId}
        resetToken={resetToken}
      />

      <div className="leaflet-top leaflet-right">
        <div className="leaflet-control m-3 flex max-w-[190px] flex-col gap-2 rounded-xl border border-slate-700 bg-slate-950/95 p-2 text-[10px] text-slate-200 shadow-xl">
          <label className="font-bold" htmlFor="accessibility-basemap">แผนที่ฐาน</label>
          <select
            id="accessibility-basemap"
            value={basemap}
            onChange={(event) => setBasemap(event.target.value as BasemapKey)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5"
          >
            {Object.entries(BASEMAPS).map(([key, item]) => (
              <option key={key} value={key}>{item.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              onSelectService(null);
              setResetToken((value) => value + 1);
            }}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 font-bold hover:border-emerald-500 hover:text-emerald-300"
          >
            จัดมุมมองใหม่
          </button>
        </div>
      </div>

      <div className="leaflet-bottom leaflet-left">
        <div className="leaflet-control m-3 max-w-[260px] rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-[10px] text-slate-300 shadow-xl">
          <div className="font-bold">{metricLabel}</div>
          <div className="mt-0.5 text-slate-500">{basisLabel} · {scenarioLabel}</div>
          <div className="mt-2 flex items-center gap-1.5">
            <span>ต่ำ</span>
            <span className="h-2.5 w-28 rounded bg-gradient-to-r from-red-700 via-yellow-400 to-emerald-700" />
            <span>สูง</span>
          </div>
          {showServices && (
            <div className="mt-2 text-slate-500">
              แสดงจุดบริการ {visibleServices.length.toLocaleString("th-TH")} แห่ง
            </div>
          )}
        </div>
      </div>
    </MapContainer>
  );
}

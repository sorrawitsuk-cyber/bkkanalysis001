/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { conversionColor, formatPercent, formatPercentagePoint, type LandCoverLayer } from "@/lib/land-cover";
import { bindLeafletKeyboardSelection } from "@/lib/leaflet-keyboard";

function FitBounds({ data, activeDistrict }: { data: any; activeDistrict: string }) {
  const map = useMap();
  useEffect(() => {
    if (!data) return;
    const selected = activeDistrict === "ทั้งหมด"
      ? data
      : {
          type: "FeatureCollection",
          features: data.features.filter((feature: any) => feature.properties?.district_name === activeDistrict),
        };
    const bounds = L.geoJSON(selected).getBounds();
    if (bounds.isValid()) map.flyToBounds(bounds, { padding: [28, 28], duration: 0.6 });
  }, [activeDistrict, data, map]);
  return null;
}

export default function LandCoverChangeMap({
  geojsonData,
  rasterUrl,
  rasterVisible,
  layer,
  activeDistrict,
  onDistrictSelect,
  maxConversion,
}: {
  geojsonData: any;
  rasterUrl: string | null;
  rasterVisible: boolean;
  layer: LandCoverLayer;
  activeDistrict: string;
  onDistrictSelect: (district: string) => void;
  maxConversion: number;
}) {
  const mapKey = useMemo(
    () => `${layer}-${rasterVisible}-${rasterUrl ?? "none"}-${geojsonData?.features?.length ?? 0}`,
    [geojsonData, layer, rasterUrl, rasterVisible],
  );

  return (
    <MapContainer
      key={mapKey}
      center={[13.7563, 100.5018]}
      zoom={10}
      className="h-full w-full bg-slate-950"
      attributionControl={false}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {rasterVisible && rasterUrl && <TileLayer url={rasterUrl} opacity={0.78} maxZoom={18} />}
      {geojsonData && (
        <>
          <GeoJSON
            data={geojsonData}
            style={(feature) => {
              const p = feature?.properties ?? {};
              const name = p.district_name;
              const selected = activeDistrict === "ทั้งหมด" || name === activeDistrict;
              return {
                color: name === activeDistrict ? "#ffffff" : "#475569",
                weight: name === activeDistrict ? 2.5 : 0.8,
                fillColor: conversionColor(p.green_to_built_pct ?? null, maxConversion),
                fillOpacity: rasterVisible ? (selected ? 0.12 : 0.02) : (selected ? 0.76 : 0.13),
              };
            }}
            onEachFeature={(feature, leafletLayer) => {
              const p = feature.properties ?? {};
              bindLeafletKeyboardSelection(leafletLayer, `เลือกเขต${p.district_name}บนแผนที่`, () => onDistrictSelect(p.district_name));
              leafletLayer.bindTooltip(`
                <div class="min-w-[220px]">
                  <strong>เขต${p.district_name}</strong><br/>
                  สีเขียว → สิ่งปลูกสร้าง: <strong>${formatPercent(p.green_to_built_pct)}</strong><br/>
                  สีเขียวเปลี่ยนสุทธิ: ${formatPercentagePoint(p.green_change_pp)}<br/>
                  สิ่งปลูกสร้างเปลี่ยนสุทธิ: ${formatPercentagePoint(p.built_change_pp)}<br/>
                  พื้นที่เปลี่ยน class: ${formatPercent(p.changed_pct)}<br/>
                  ความเชื่อมั่นเฉลี่ย: ${formatPercent(p.confidence_pct)}
                </div>
              `, { sticky: true });
              leafletLayer.on("click", () => onDistrictSelect(p.district_name));
            }}
          />
          <FitBounds data={geojsonData} activeDistrict={activeDistrict} />
        </>
      )}
    </MapContainer>
  );
}

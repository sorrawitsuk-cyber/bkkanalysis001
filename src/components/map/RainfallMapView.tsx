/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatRainfall, rainfallColor } from "@/lib/rainfall";
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
    if (bounds.isValid()) map.flyToBounds(bounds, { padding: [28, 28], duration: 0.7 });
  }, [activeDistrict, data, map]);

  return null;
}

export default function RainfallMapView({
  geojsonData,
  rasterUrl,
  rasterVisible,
  activeDistrict,
  onDistrictSelect,
  maxValue,
}: {
  geojsonData: any;
  rasterUrl: string | null;
  rasterVisible: boolean;
  activeDistrict: string;
  onDistrictSelect: (district: string) => void;
  maxValue: number;
}) {
  const mapKey = useMemo(
    () => `${rasterVisible}-${rasterUrl ?? "none"}-${geojsonData?.features?.length ?? 0}`,
    [geojsonData, rasterUrl, rasterVisible],
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
      {rasterVisible && rasterUrl && (
        <TileLayer url={rasterUrl} opacity={0.72} maxZoom={18} />
      )}
      {geojsonData && (
        <>
          <GeoJSON
            data={geojsonData}
            style={(feature) => {
              const name = feature?.properties?.district_name;
              const selected = activeDistrict === "ทั้งหมด" || name === activeDistrict;
              return {
                color: name === activeDistrict ? "#ffffff" : "#334155",
                weight: name === activeDistrict ? 2.5 : 0.8,
                fillColor: rainfallColor(feature?.properties?.rainfall_mm ?? null, maxValue),
                fillOpacity: rasterVisible ? (selected ? 0.12 : 0.03) : (selected ? 0.78 : 0.16),
              };
            }}
            onEachFeature={(feature, layer) => {
              const properties = feature.properties ?? {};
              bindLeafletKeyboardSelection(layer, `เลือกเขต${properties.district_name}บนแผนที่`, () => onDistrictSelect(properties.district_name));
              const change = properties.change_mm;
              const changeLabel = typeof change === "number"
                ? `${change >= 0 ? "+" : ""}${change.toFixed(1)} มม.`
                : "ไม่มีข้อมูล";
              layer.bindTooltip(`
                <div class="min-w-[190px]">
                  <strong>${properties.district_name}</strong><br/>
                  ฝนสะสม: <strong>${formatRainfall(properties.rainfall_mm)}</strong><br/>
                  เฉลี่ยต่อวัน: ${formatRainfall(properties.daily_average_mm)}<br/>
                  เทียบช่วงเดียวกันปีก่อน: ${changeLabel}
                </div>
              `, { sticky: true });
              layer.on("click", () => onDistrictSelect(properties.district_name));
            }}
          />
          <FitBounds data={geojsonData} activeDistrict={activeDistrict} />
        </>
      )}
    </MapContainer>
  );
}

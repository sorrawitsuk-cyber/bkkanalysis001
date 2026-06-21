/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { builtChangeColor, builtCoverColor, formatUrbanChange, formatUrbanPercent, formatUrbanRai } from "@/lib/urban-expansion";
import { bindLeafletKeyboardSelection } from "@/lib/leaflet-keyboard";

interface Props {
  geojsonData: any;
  rasterUrl: string | null;
  rasterVisible: boolean;
  mode: "cover" | "change";
  activeDistrict: string;
  opacity: number;
  baseMap: "dark" | "light" | "satellite" | "streets" | "none";
  onDistrictSelect: (district: string) => void;
}

const ALL_DISTRICTS = "ทั้งหมด";
const BKK_BOUNDS: [[number, number], [number, number]] = [[13.494, 100.329], [13.956, 100.935]];
const BASE_MAPS = {
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  streets: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
};

export default function UrbanExpansionMap(props: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const baseRef = useRef<L.TileLayer | null>(null);
  const rasterRef = useRef<L.TileLayer | null>(null);
  const geoRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    if (mapRef.current) return;
    mapRef.current = L.map("urban-expansion-map", { center: [13.7563, 100.5018], zoom: 10, zoomControl: false });
    L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
    baseRef.current = L.tileLayer(BASE_MAPS.dark, { attribution: "© OpenStreetMap contributors © CARTO", subdomains: "abcd", maxZoom: 20 }).addTo(mapRef.current);
    mapRef.current.fitBounds(BKK_BOUNDS, { padding: [12, 12] });
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!baseRef.current) return;
    if (props.baseMap === "none") return void baseRef.current.setOpacity(0);
    baseRef.current.setOpacity(1);
    baseRef.current.setUrl(BASE_MAPS[props.baseMap]);
  }, [props.baseMap]);

  useEffect(() => {
    if (!mapRef.current) return;
    rasterRef.current?.remove();
    rasterRef.current = null;
    if (props.rasterVisible && props.rasterUrl) rasterRef.current = L.tileLayer(props.rasterUrl, { opacity: props.opacity, maxZoom: 20 }).addTo(mapRef.current);
  }, [props.opacity, props.rasterUrl, props.rasterVisible]);

  useEffect(() => {
    if (!mapRef.current || !props.geojsonData) return;
    geoRef.current?.remove();
    geoRef.current = L.geoJSON(props.geojsonData, {
      style: (feature) => {
        const p = feature?.properties ?? {};
        const selected = props.activeDistrict === p.district_name;
        const value = props.mode === "change" ? p.built_change_pp : p.built_cover_pct;
        return {
          color: selected ? "#fff" : "#94a3b8",
          weight: selected ? 2.5 : 0.8,
          fillColor: props.mode === "change" ? builtChangeColor(value) : builtCoverColor(value),
          fillOpacity: props.rasterVisible ? (selected ? 0.24 : 0.08) : (selected ? 0.82 : 0.6),
        };
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties ?? {};
        const district = p.district_name ?? p.name_th;
        bindLeafletKeyboardSelection(layer, `เลือกเขต${district}บนแผนที่`, () => props.onDistrictSelect(props.activeDistrict === district ? ALL_DISTRICTS : district));
        layer.bindTooltip(
          `<div class="min-w-[205px]"><div class="font-bold text-slate-900">เขต${district}</div>
          <div class="mt-1 text-xs">Built-up cover: <b>${formatUrbanPercent(p.built_cover_pct)}</b></div>
          <div class="text-xs">พื้นที่: <b>${formatUrbanRai(p.built_area_rai)}</b></div>
          <div class="text-xs">เปลี่ยนจากปีฐาน: <b>${formatUrbanChange(p.built_change_pp)}</b></div>
          <div class="text-xs">สีเขียว → สิ่งปลูกสร้าง: <b>${formatUrbanPercent(p.green_to_built_pct)}</b></div></div>`,
          { sticky: true, direction: "top" },
        );
        layer.on("click", () => props.onDistrictSelect(props.activeDistrict === district ? ALL_DISTRICTS : district));
      },
    }).addTo(mapRef.current);
    if (props.activeDistrict === ALL_DISTRICTS) mapRef.current.fitBounds(BKK_BOUNDS, { padding: [12, 12] });
    else geoRef.current.eachLayer((layer: any) => {
      if (layer.feature?.properties?.district_name === props.activeDistrict && layer.getBounds) mapRef.current?.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 13 });
    });
  }, [props.activeDistrict, props.geojsonData, props.mode, props.onDistrictSelect, props.rasterVisible]);

  return <div id="urban-expansion-map" className="h-full w-full bg-slate-950" />;
}

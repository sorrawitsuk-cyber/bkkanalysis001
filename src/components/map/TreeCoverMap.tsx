/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatTreeChange, formatTreePercent, formatTreeRai, treeChangeColor, treeCoverColor } from "@/lib/tree-cover";

interface TreeCoverMapProps {
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

export default function TreeCoverMap({
  geojsonData,
  rasterUrl,
  rasterVisible,
  mode,
  activeDistrict,
  opacity,
  baseMap,
  onDistrictSelect,
}: TreeCoverMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const rasterRef = useRef<L.TileLayer | null>(null);
  const geojsonRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    if (mapRef.current) return;
    mapRef.current = L.map("tree-cover-map", {
      center: [13.7563, 100.5018],
      zoom: 10,
      zoomControl: false,
    });
    L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
    baseLayerRef.current = L.tileLayer(BASE_MAPS.dark, {
      attribution: "© OpenStreetMap contributors © CARTO",
      subdomains: "abcd",
      maxZoom: 20,
    }).addTo(mapRef.current);
    mapRef.current.fitBounds(BKK_BOUNDS, { padding: [12, 12] });
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !baseLayerRef.current) return;
    if (baseMap === "none") {
      baseLayerRef.current.setOpacity(0);
      return;
    }
    baseLayerRef.current.setOpacity(1);
    baseLayerRef.current.setUrl(BASE_MAPS[baseMap]);
  }, [baseMap]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (rasterRef.current) {
      rasterRef.current.remove();
      rasterRef.current = null;
    }
    if (rasterVisible && rasterUrl) {
      rasterRef.current = L.tileLayer(rasterUrl, { opacity, maxZoom: 20 }).addTo(mapRef.current);
    }
  }, [opacity, rasterUrl, rasterVisible]);

  useEffect(() => {
    if (!mapRef.current || !geojsonData) return;
    geojsonRef.current?.remove();
    geojsonRef.current = L.geoJSON(geojsonData, {
      style: (feature) => {
        const props = feature?.properties ?? {};
        const selected = activeDistrict === props.district_name || activeDistrict === props.name_th;
        const value = mode === "change" ? props.tree_cover_change_pp : props.tree_cover_pct;
        return {
          color: selected ? "#f8fafc" : "#94a3b8",
          weight: selected ? 2.5 : 0.8,
          fillColor: mode === "change" ? treeChangeColor(value) : treeCoverColor(value),
          fillOpacity: rasterVisible ? (selected ? 0.25 : 0.08) : (selected ? 0.8 : 0.58),
        };
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties ?? {};
        const district = props.district_name ?? props.name_th;
        layer.bindTooltip(
          `<div class="min-w-[190px]">
            <div class="font-bold text-slate-900">เขต${district}</div>
            <div class="mt-1 text-xs">Tree Cover: <b>${formatTreePercent(props.tree_cover_pct)}</b></div>
            <div class="text-xs">พื้นที่: <b>${formatTreeRai(props.tree_cover_rai)}</b></div>
            <div class="text-xs">เปลี่ยนจากปีฐาน: <b>${formatTreeChange(props.tree_cover_change_pp)}</b></div>
            <div class="text-xs">เพิ่ม / สูญเสีย: <b>${formatTreePercent(props.tree_gain_pct)} / ${formatTreePercent(props.tree_loss_pct)}</b></div>
          </div>`,
          { sticky: true, direction: "top" },
        );
        layer.on("click", () => onDistrictSelect(activeDistrict === district ? ALL_DISTRICTS : district));
      },
    }).addTo(mapRef.current);

    if (activeDistrict !== ALL_DISTRICTS) {
      geojsonRef.current.eachLayer((layer: any) => {
        const district = layer.feature?.properties?.district_name ?? layer.feature?.properties?.name_th;
        if (district === activeDistrict && layer.getBounds) {
          mapRef.current?.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 13 });
        }
      });
    } else {
      mapRef.current.fitBounds(BKK_BOUNDS, { padding: [12, 12] });
    }
  }, [activeDistrict, geojsonData, mode, onDistrictSelect, rasterVisible]);

  return <div id="tree-cover-map" className="h-full w-full bg-slate-950" />;
}

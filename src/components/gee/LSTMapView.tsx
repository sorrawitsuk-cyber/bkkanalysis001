/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";

interface LSTMapViewProps {
  geojsonData: any;
  invertedMask?: any;
  activeDistrict: string;
  mapMode: 'district' | 'idw';
  compareMode?: boolean;
  summary?: any;
  opacity?: number;
  baseMap?: 'dark' | 'light' | 'satellite' | 'streets';
}

export default function LSTMapView({ geojsonData, invertedMask, activeDistrict, mapMode, compareMode, summary, opacity = 0.8, baseMap = 'dark' }: LSTMapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const geojsonLayerRef = useRef<L.GeoJSON | null>(null);
  const heatLayerRef = useRef<any>(null);
  const maskLayerRef = useRef<L.GeoJSON | null>(null);
  const geeLayerRef = useRef<L.TileLayer | null>(null);
  const yearRef = useRef(summary?.selectedYear || 2024);

  // Update yearRef when summary changes
  useEffect(() => {
    if (summary?.selectedYear) {
      yearRef.current = summary.selectedYear;
    }
  }, [summary?.selectedYear]);

  useEffect(() => {
    if (!mapRef.current) {
      mapRef.current = L.map("lst-map", {
        center: [13.7563, 100.5018],
        zoom: 11,
        zoomControl: false,
      });

      // Initialize base layer
      baseLayerRef.current = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(mapRef.current);

      // Add Map Click Handler for Point Query
      mapRef.current.on('click', async (e: L.LeafletMouseEvent) => {
        if (!mapRef.current) return;
        
        const { lat, lng } = e.latlng;
        
        // Show loading popup
        const popup = L.popup()
          .setLatLng(e.latlng)
          .setContent('<div class="p-2 text-xs font-mono"><span class="animate-pulse">⏳ กำลังวิเคราะห์พิกเซล...</span></div>')
          .openOn(mapRef.current);

        try {
          const res = await fetch(`/api/gee/point?lat=${lat}&lng=${lng}&year=${yearRef.current}`);
          const data = await res.json();
          
          if (data.temp !== undefined && data.temp !== null) {
            popup.setContent(`
              <div class="bg-slate-950 text-white p-3 rounded-lg border border-slate-800 shadow-2xl min-w-[140px]">
                <div class="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-2 border-b border-slate-800 pb-1">Pixel Analysis</div>
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[10px] text-slate-400">พิกเซล (LST):</span>
                  <span class="text-orange-400 font-mono font-bold text-lg">${data.temp}°C</span>
                </div>
                <div class="text-[9px] text-slate-500 italic mt-1">
                  📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}
                </div>
              </div>
            `);
          } else {
            popup.setContent('<div class="p-2 text-xs text-yellow-400">⚠️ No data at this point</div>');
          }
        } catch (err) {
          popup.setContent('<div class="p-2 text-xs text-red-400">❌ Error fetching data</div>');
        }
      });
    }
  }, []);

  // Handle Base Map change
  useEffect(() => {
    if (!mapRef.current || !baseLayerRef.current) return;

    const mapUrls: Record<string, string> = {
      dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      streets: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    };

    baseLayerRef.current.setUrl(mapUrls[baseMap] || mapUrls.dark);
  }, [baseMap]);

  // Function to determine color based on temperature
  const getColor = (temp: number) => {
    if (compareMode) {
      return temp > 1.5 ? '#B2182B' :
             temp > 0.5 ? '#EF8A62' :
             temp > -0.5 ? '#F7F7F7' :
             temp > -1.5 ? '#67A9CF' :
                          '#2166AC';
    } else {
      // Dynamic scaling using min/max
      const min = summary?.min_lst || 30;
      const max = summary?.max_lst || 40;
      const range = max - min;
      const pct = (temp - min) / range;
      
      return pct > 0.8 ? '#800026' :
             pct > 0.6 ? '#E31A1C' :
             pct > 0.4 ? '#FD8D3C' :
             pct > 0.2 ? '#FEB24C' :
                         '#FFEDA0';
    }
  };

  useEffect(() => {
    const updateGeeLayer = async () => {
      if (!mapRef.current) return;

      // Clean up previous layers
      if (heatLayerRef.current) {
        mapRef.current.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
      if (geeLayerRef.current) {
        mapRef.current.removeLayer(geeLayerRef.current);
        geeLayerRef.current = null;
      }

      if (mapMode === 'idw' && summary?.selectedYear) {
        try {
          const res = await fetch(`/api/gee/tiles?year=${summary.selectedYear}&compare=${compareMode}&baseline=${summary.compareYear}`);
          const data = await res.json();
          if (data.urlFormat) {
            geeLayerRef.current = L.tileLayer(data.urlFormat, {
              maxZoom: 20,
              opacity: opacity
            }).addTo(mapRef.current);
          }
        } catch (err) {
          console.error("Failed to load GEE tiles:", err);
        }
      }
    };

    updateGeeLayer();
  }, [mapMode, summary?.selectedYear, compareMode, summary?.compareYear]);

  // Update opacity when prop changes
  useEffect(() => {
    if (geeLayerRef.current) {
      geeLayerRef.current.setOpacity(opacity);
    }
  }, [opacity]);

  useEffect(() => {
    if (!mapRef.current || !geojsonData) return;

    if (geojsonLayerRef.current) {
      mapRef.current.removeLayer(geojsonLayerRef.current);
    }

    if (maskLayerRef.current) {
      mapRef.current.removeLayer(maskLayerRef.current);
      maskLayerRef.current = null;
    }

    if (mapMode === 'district' || activeDistrict !== 'ทั้งหมด') {
      geojsonLayerRef.current = L.geoJSON(geojsonData, {
        style: (feature) => {
          const val = compareMode ? feature?.properties?.delta : feature?.properties?.mean_lst;
          const temp = val || 0;
          const isSelected = activeDistrict !== 'ทั้งหมด' && 
                             (feature?.properties?.name_th === activeDistrict || `เขต${feature?.properties?.name_th}` === activeDistrict);
          
          const isDimmed = activeDistrict !== 'ทั้งหมด' && !isSelected;

          return {
            fillColor: getColor(temp),
            weight: isSelected ? 3 : 1,
            opacity: 1,
            color: isSelected ? '#ffffff' : '#1e293b',
            dashArray: '3',
            fillOpacity: isDimmed ? 0.2 : 0.7
          };
        },
        onEachFeature: (feature, layer) => {
          const name = feature.properties?.name_th || 'Unknown';
          const val = compareMode ? feature.properties?.delta : feature.properties?.mean_lst;
          const maxVal = feature.properties?.max_lst;
          
          if (val !== undefined && val !== null) {
            const displayVal = compareMode ? (val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2)) : val.toFixed(2);
            const extraInfo = !compareMode && maxVal ? `<div class="text-[10px] text-slate-400 mt-1">สูงสุด: <span class="text-red-400 font-mono">${maxVal.toFixed(2)}°C</span></div>` : '';
            
            layer.bindTooltip(`
              <div class="bg-slate-900 text-slate-100 p-2.5 rounded border border-slate-700 shadow-xl min-w-[120px]">
                <div class="font-bold mb-1 border-b border-slate-800 pb-1">${name}</div>
                <div class="text-[10px] text-slate-400">${compareMode ? 'ส่วนต่าง:' : 'เฉลี่ย:'} <span class="text-${compareMode ? (val > 0 ? 'red' : 'blue') : 'orange'}-400 text-lg font-mono ml-1">${displayVal}°C</span></div>
                ${extraInfo}
              </div>
            `, { sticky: true, className: 'bg-transparent border-none shadow-none' });
          }
        }
      }).addTo(mapRef.current);
    } else {
      // GEE Mode - Add invisible polygons just for tooltip interactivity
      geojsonLayerRef.current = L.geoJSON(geojsonData, {
        style: { fillOpacity: 0, weight: 1, color: 'rgba(255,255,255,0.1)' },
        onEachFeature: (feature, layer) => {
          const name = feature.properties?.name_th || 'Unknown';
          const val = compareMode ? feature.properties?.delta : feature.properties?.mean_lst;
          const maxVal = feature.properties?.max_lst;
          
          if (val !== undefined && val !== null) {
            const displayVal = compareMode ? (val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2)) : val.toFixed(2);
            const extraInfo = !compareMode && maxVal ? `<div class="text-[10px] text-slate-400 mt-1">สูงสุด: <span class="text-red-400 font-mono">${maxVal.toFixed(2)}°C</span></div>` : '';
            
            layer.bindTooltip(`
              <div class="bg-slate-900 text-slate-100 p-2.5 rounded border border-slate-700 shadow-xl min-w-[120px]">
                <div class="font-bold mb-1 border-b border-slate-800 pb-1">${name}</div>
                <div class="text-[10px] text-slate-400">${compareMode ? 'ส่วนต่าง:' : 'เฉลี่ย:'} <span class="text-${compareMode ? (val > 0 ? 'red' : 'blue') : 'orange'}-400 text-lg font-mono ml-1">${displayVal}°C</span></div>
                ${extraInfo}
              </div>
            `, { sticky: true, className: 'bg-transparent border-none shadow-none' });
          }
        }
      }).addTo(mapRef.current);

      // Removed inverted mask to show full base map coverage
    }

    // Zoom to selected district
    if (activeDistrict !== 'ทั้งหมด' && geojsonLayerRef.current) {
      const selectedLayers = geojsonLayerRef.current.getLayers().filter((l: any) => 
        l.feature.properties.name_th === activeDistrict || `เขต${l.feature.properties.name_th}` === activeDistrict
      );
      if (selectedLayers.length > 0 && selectedLayers[0] instanceof L.Polygon) {
        const bounds = (selectedLayers[0] as L.Polygon).getBounds();
        mapRef.current.flyToBounds(bounds, { padding: [50, 50], duration: 1.5 });
      }
    } else if (geojsonLayerRef.current) {
      // Fit to whole BKK
      mapRef.current.flyToBounds(geojsonLayerRef.current.getBounds(), { padding: [20, 20], duration: 1.5 });
    }

  }, [geojsonData, invertedMask, activeDistrict, mapMode, compareMode, summary]);

  return (
    <div id="lst-map" className="w-full h-full z-0" style={{ background: '#0b0f19' }} />
  );
}

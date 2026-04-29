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
}

export default function LSTMapView({ geojsonData, invertedMask, activeDistrict, mapMode, compareMode, summary }: LSTMapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const geojsonLayerRef = useRef<L.GeoJSON | null>(null);
  const heatLayerRef = useRef<any>(null);
  const maskLayerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    if (!mapRef.current) {
      mapRef.current = L.map("lst-map", {
        center: [13.7563, 100.5018],
        zoom: 11,
        zoomControl: false,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(mapRef.current);
    }
  }, []);

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
    if (!mapRef.current || !geojsonData) return;

    if (geojsonLayerRef.current) {
      mapRef.current.removeLayer(geojsonLayerRef.current);
    }

    if (heatLayerRef.current) {
      mapRef.current.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
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
          
          if (val !== undefined && val !== null) {
            const displayVal = compareMode ? (val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2)) : val.toFixed(2);
            layer.bindTooltip(`
              <div class="bg-slate-900 text-slate-100 p-2 rounded border border-slate-700 shadow-xl">
                <div class="font-bold mb-1">${name}</div>
                <div class="text-${compareMode ? (val > 0 ? 'red' : 'blue') : 'orange'}-400 text-lg font-mono">${displayVal} °C</div>
              </div>
            `, { sticky: true, className: 'bg-transparent border-none shadow-none' });
          }
        }
      }).addTo(mapRef.current);
    } else {
      // IDW Map Mode
      const heatPoints: any[] = [];
      const tempGeojsonLayer = L.geoJSON(geojsonData);
      
      tempGeojsonLayer.eachLayer((layer: any) => {
        if (layer.getBounds) {
          const val = compareMode ? layer.feature.properties.delta : layer.feature.properties.mean_lst;
          if (val !== undefined && val !== null) {
            const center = layer.getBounds().getCenter();
            
            // Normalize intensity based on dynamic range
            let intensity = 0;
            if (compareMode) {
              const min = summary?.min_delta || -2;
              const max = summary?.max_delta || 2;
              intensity = (val - min) / (max - min);
            } else {
              const min = summary?.min_lst || 30;
              const max = summary?.max_lst || 40;
              intensity = (val - min) / (max - min);
            }
            intensity = Math.max(0.01, Math.min(1.0, intensity));
            
            // Add multiple points around centroid to fill the district area smoothly
            heatPoints.push([center.lat, center.lng, intensity]);
            heatPoints.push([center.lat + 0.02, center.lng, intensity]);
            heatPoints.push([center.lat - 0.02, center.lng, intensity]);
            heatPoints.push([center.lat, center.lng + 0.02, intensity]);
            heatPoints.push([center.lat, center.lng - 0.02, intensity]);
          }
        }
      });

      const gradient = compareMode ? {
        0.0: '#2166AC',
        0.25: '#67A9CF',
        0.5: '#F7F7F7',
        0.75: '#EF8A62',
        1.0: '#B2182B'
      } : {
        0.0: '#FFEDA0',
        0.2: '#FED976',
        0.4: '#FD8D3C',
        0.6: '#E31A1C',
        0.8: '#BD0026',
        1.0: '#800026'
      };

      // @ts-ignore
      heatLayerRef.current = L.heatLayer(heatPoints, {
        radius: 65,
        blur: 85,
        maxZoom: 11,
        minOpacity: 0.4,
        gradient: gradient
      }).addTo(mapRef.current);

      // Add inverted mask to clip the heat layer
      if (invertedMask) {
        maskLayerRef.current = L.geoJSON(invertedMask, {
          style: {
            fillColor: '#0b0f19',
            fillOpacity: 1,
            color: 'transparent',
            weight: 0
          },
          interactive: false // Let mouse events pass through to tooltip layer
        }).addTo(mapRef.current);
      }

      // Add invisible polygons just for tooltip interactivity
      geojsonLayerRef.current = L.geoJSON(geojsonData, {
        style: { fillOpacity: 0, weight: 1, color: 'rgba(255,255,255,0.1)' },
        onEachFeature: (feature, layer) => {
          const name = feature.properties?.name_th || 'Unknown';
          const val = compareMode ? feature.properties?.delta : feature.properties?.mean_lst;
          if (val !== undefined && val !== null) {
            const displayVal = compareMode ? (val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2)) : val.toFixed(2);
            layer.bindTooltip(`
              <div class="bg-slate-900 text-slate-100 p-2 rounded border border-slate-700 shadow-xl">
                <div class="font-bold mb-1">${name}</div>
                <div class="text-${compareMode ? (val > 0 ? 'red' : 'blue') : 'orange'}-400 text-lg font-mono">${displayVal} °C</div>
              </div>
            `, { sticky: true, className: 'bg-transparent border-none shadow-none' });
          }
        }
      }).addTo(mapRef.current);
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

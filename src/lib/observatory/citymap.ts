export const BMA_CITYMAP = {
  datasetId: "bma-citymap-basemap",
  mapName: "Basemap1000_4326_H",
  restUrl:
    "https://citymap.bangkok.go.th/citymap/rest/services/Basemap_Service/Basemap1000_4326_H/MapServer",
  wmsUrl:
    "https://citymap.bangkok.go.th/citymap/services/Basemap_Service/Basemap1000_4326_H/MapServer/WMSServer",
  wmsVersion: "1.3.0",
  wmsLayers: "0,1,2,3,4,5,6,7,8,9,10,11,12,13,14",
  districtLayerId: 13,
  subdistrictLayerId: 12,
  attribution:
    '&copy; <a href="https://citymap.bangkok.go.th/citymap/rest/services/Basemap_Service/Basemap1000_4326_H/MapServer" target="_blank" rel="noreferrer">กรุงเทพมหานคร · Bangkok CityMap</a>',
} as const;

export type CityMapStatus = "loading" | "ready" | "unavailable";

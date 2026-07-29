# Decision 0006: Consume Bangkok CityMap as a direct public basemap

Date: 2026-07-29
Status: Accepted

## Context

The product direction is to stop the email authorization workflow and use data
services that a general user can access directly. Bangkok Metropolitan
Administration publishes the `Basemap1000_4326_H` ArcGIS MapServer without
authentication.

Technical inspection confirms:

- ArcGIS Server 11.5 with `Map`, `Query` and `Data` capabilities;
- dynamic map rendering in EPSG:4326;
- WMS 1.3.0 support for `CRS:84` and `EPSG:4326`;
- 15 public layers, including district polygons on layer 13 and subdistrict
  polygons on layer 12;
- layer 13 returns 50 district records with the complete `1001-1050` code set;
- the district layer reports survey year 2561.

The service metadata has an empty `copyrightText` and does not state
redistribution terms.

## Decision

The Observatory consumes the CityMap WMS directly from the user's browser as
the contextual basemap.

- Requests go to the official BMA service. The Observatory does not proxy,
  snapshot, cache or republish the basemap.
- The interface labels the basemap as Bangkok CityMap and reports loading or
  unavailable state without silently switching providers.
- The basemap is visual context only. It is not an analytical value, remote
  sensing observation, validation source or evidence of field conditions.
- The existing static GML authorization record is marked `withdrawn`; its gate
  remains blocked and no email is sent.
- Public query access to district layer 13 may be technically assessed in a
  later processing decision, but this decision does not publish its geometry or
  promote it as the canonical analytical boundary.

## Consequences

The map can use an official Bangkok context immediately while keeping source
roles explicit. Service downtime results in an unavailable basemap state, while
the district list and table remain usable.

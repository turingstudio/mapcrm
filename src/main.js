import * as maplibregl from "/vendor/maplibre-gl/maplibre-gl.mjs";

const { convertFileSrc } = window.__TAURI__.core;

// Served through Tauri's asset protocol (not the frontendDist static server) because
// PMTiles needs HTTP Range support, which the plain dev/prod asset server doesn't provide.
const PMTILES_URL = convertFileSrc("/Users/nick/dev/turing/mapcrm/src/data/basemap.pmtiles");
const BOSTON_CENTER = [-71.0589, 42.3601];

const TEST_CONTACT = {
  name: "Test Contact",
  address: "1 City Hall Square, Boston, MA 02201",
  lngLat: BOSTON_CENTER,
};

function initMap() {
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  return new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {
        basemap: {
          type: "vector",
          url: `pmtiles://${PMTILES_URL}`,
        },
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#f2efe9" } },
        {
          id: "landcover",
          type: "fill",
          source: "basemap",
          "source-layer": "landcover",
          paint: { "fill-color": "#d8e8c8" },
        },
        {
          id: "water",
          type: "fill",
          source: "basemap",
          "source-layer": "water",
          paint: { "fill-color": "#aad3e0" },
        },
        {
          id: "buildings",
          type: "fill",
          source: "basemap",
          "source-layer": "building",
          minzoom: 13,
          paint: { "fill-color": "#d9d0c4", "fill-outline-color": "#c4b8a6" },
        },
        {
          id: "roads",
          type: "line",
          source: "basemap",
          "source-layer": "transportation",
          paint: {
            "line-color": "#ffffff",
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 16, 4],
          },
        },
        {
          id: "boundaries",
          type: "line",
          source: "basemap",
          "source-layer": "boundary",
          paint: { "line-color": "#9a8f80", "line-width": 1, "line-dasharray": [2, 2] },
        },
        {
          id: "place-labels",
          type: "symbol",
          source: "basemap",
          "source-layer": "place",
          layout: { "text-field": ["get", "name"], "text-size": 12 },
          paint: { "text-color": "#333333", "text-halo-color": "#ffffff", "text-halo-width": 1 },
        },
      ],
    },
    center: BOSTON_CENTER,
    zoom: 11,
  });
}

function addContactMarker(map, contact) {
  const content = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = contact.name;
  const address = document.createElement("div");
  address.textContent = contact.address;
  content.append(name, address);

  const popup = new maplibregl.Popup({ offset: 25 }).setDOMContent(content);
  new maplibregl.Marker().setLngLat(contact.lngLat).setPopup(popup).addTo(map);
}

$(function () {
  const map = initMap();
  addContactMarker(map, TEST_CONTACT);
});

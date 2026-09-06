import * as maplibregl from "/vendor/maplibre-gl/maplibre-gl.mjs";

const { convertFileSrc, invoke } = window.__TAURI__.core;
const Database = window.PluginSqlDatabase;

const BOSTON_CENTER = [-71.0589, 42.3601];

let pmtilesUrl = null;
let map = null;
const practiceMarkers = new Map();

let detailMap = null;
let detailMarker = null;

function setupMapLibre() {
  // MapLibre's auto-detected worker script URL doesn't resolve correctly under Tauri's
  // production asset serving (it ends up empty, so the worker never starts) - set it explicitly.
  maplibregl.setWorkerUrl(new URL("/vendor/maplibre-gl/maplibre-gl-worker.mjs", window.location.href).href);

  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
}

function buildMapStyle() {
  return {
    version: 8,
    sources: {
      basemap: {
        type: "vector",
        url: `pmtiles://${pmtilesUrl}`,
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
  };
}

function createMap(containerId, center, zoom) {
  return new maplibregl.Map({
    container: containerId,
    style: buildMapStyle(),
    center,
    zoom,
  });
}

function activateTab(tab) {
  $(".tab-button").removeClass("active");
  $(`.tab-button[data-tab="${tab}"]`).addClass("active");
  $(".tab-panel").removeClass("active");
  $(`#${tab}-panel`).addClass("active");
  if (tab === "map") {
    map?.resize();
  } else if (tab === "crm" && !$("#practice-detail-view").prop("hidden")) {
    detailMap?.resize();
  }
}

function initTabs() {
  $(".tab-button").on("click", function () {
    activateTab($(this).data("tab"));
  });
  activateTab("crm");
}

function renderMapMarkers(practices) {
  if (!map) return;

  for (const marker of practiceMarkers.values()) marker.remove();
  practiceMarkers.clear();

  for (const practice of practices) {
    if (practice.lat == null || practice.lng == null) continue;

    const content = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = practice.name;
    const address = document.createElement("div");
    address.textContent = practice.address || "";
    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "popup-view-btn";
    viewBtn.textContent = "View Details";
    viewBtn.addEventListener("click", () => {
      activateTab("crm");
      showPracticeDetail(practice);
    });
    content.append(name, address, viewBtn);

    const popup = new maplibregl.Popup({ offset: 25 }).setDOMContent(content);
    const marker = new maplibregl.Marker()
      .setLngLat([practice.lng, practice.lat])
      .setPopup(popup)
      .addTo(map);

    practiceMarkers.set(practice.id, marker);
  }
}

// --- CRM ---

let db = null;

async function loadPractices() {
  const rows = await db.select("SELECT * FROM practices ORDER BY name COLLATE NOCASE");
  renderPractices(rows);
  renderMapMarkers(rows);
}

function renderPractices(rows) {
  const $tbody = $("#practices-tbody").empty();
  $("#practices-empty").prop("hidden", rows.length > 0);
  $("#practices-table").prop("hidden", rows.length === 0);

  for (const practice of rows) {
    const $row = $("<tr>").data("practice", practice);
    $("<td>").text(practice.name).appendTo($row);
    $("<td>").text(practice.contact_name || "").appendTo($row);
    $("<td>").text(practice.phone || "").appendTo($row);
    $("<td>").text(practice.email || "").appendTo($row);
    $("<td>").text(practice.address || "").appendTo($row);
    $tbody.append($row);
  }
}

async function geocodeWithStatus(address, $status) {
  $status.text(address ? "Locating address…" : "");
  let coords = null;
  try {
    coords = await invoke("geocode_address", { address });
  } catch {
    // Leave coords null - practice is still saved without map coordinates.
  }
  $status.text(address && coords == null ? "Couldn't locate this address on the map - saved without a pin." : "");
  return coords ?? [null, null];
}

// --- Add Practice modal ---

function openAddPracticeModal() {
  $("#practice-name").val("");
  $("#practice-contact-name").val("");
  $("#practice-phone").val("");
  $("#practice-email").val("");
  $("#practice-address").val("");
  $("#practice-notes").val("");
  $("#practice-geocode-status").text("");
  $("#practice-modal").prop("hidden", false);
  $("#practice-name").trigger("focus");
}

function closeAddPracticeModal() {
  $("#practice-modal").prop("hidden", true);
}

async function saveNewPractice() {
  const address = $("#practice-address").val().trim();
  const values = [
    $("#practice-name").val().trim(),
    $("#practice-contact-name").val().trim(),
    $("#practice-phone").val().trim(),
    $("#practice-email").val().trim(),
    address,
    $("#practice-notes").val().trim(),
  ];

  const $submitBtn = $("#practice-form button[type=submit]");
  $submitBtn.prop("disabled", true);
  const [lat, lng] = await geocodeWithStatus(address, $("#practice-geocode-status"));

  await db.execute(
    "INSERT INTO practices (name, contact_name, phone, email, address, notes, lat, lng) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [...values, lat, lng],
  );

  $submitBtn.prop("disabled", false);
  closeAddPracticeModal();
  await loadPractices();
}

// --- Practice detail screen ---

function ensureDetailMap(center) {
  if (!detailMap) {
    detailMap = createMap("detail-map", center, 15);
  } else {
    detailMap.resize();
    detailMap.jumpTo({ center, zoom: 15 });
  }
}

function setDetailMarker(practice) {
  detailMarker?.remove();
  detailMarker = null;
  if (practice.lat != null && practice.lng != null) {
    detailMarker = new maplibregl.Marker().setLngLat([practice.lng, practice.lat]).addTo(detailMap);
  }
}

function showPracticeDetail(practice) {
  $("#detail-id").val(practice.id);
  $("#detail-name").val(practice.name ?? "");
  $("#detail-contact-name").val(practice.contact_name ?? "");
  $("#detail-phone").val(practice.phone ?? "");
  $("#detail-email").val(practice.email ?? "");
  $("#detail-address").val(practice.address ?? "");
  $("#detail-notes").val(practice.notes ?? "");
  $("#detail-geocode-status").text("");

  $("#practices-list-view").prop("hidden", true);
  $("#practice-detail-view").prop("hidden", false);

  const center = practice.lat != null && practice.lng != null ? [practice.lng, practice.lat] : BOSTON_CENTER;
  ensureDetailMap(center);
  setDetailMarker(practice);
}

function showPracticesList() {
  $("#practice-detail-view").prop("hidden", true);
  $("#practices-list-view").prop("hidden", false);
}

async function saveDetailPractice() {
  const id = $("#detail-id").val();
  const address = $("#detail-address").val().trim();
  const values = [
    $("#detail-name").val().trim(),
    $("#detail-contact-name").val().trim(),
    $("#detail-phone").val().trim(),
    $("#detail-email").val().trim(),
    address,
    $("#detail-notes").val().trim(),
  ];

  const $saveBtn = $("#detail-save-btn");
  $saveBtn.prop("disabled", true);
  const [lat, lng] = await geocodeWithStatus(address, $("#detail-geocode-status"));

  await db.execute(
    `UPDATE practices SET name = $1, contact_name = $2, phone = $3, email = $4, address = $5, notes = $6,
     lat = $7, lng = $8, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $9`,
    [...values, lat, lng, id],
  );
  $saveBtn.prop("disabled", false);

  const [updated] = await db.select("SELECT * FROM practices WHERE id = $1", [id]);
  const center = updated.lat != null && updated.lng != null ? [updated.lng, updated.lat] : BOSTON_CENTER;
  detailMap?.flyTo({ center, zoom: 15 });
  setDetailMarker(updated);

  await loadPractices();
}

async function deleteDetailPractice() {
  const id = $("#detail-id").val();
  // window.confirm() isn't implemented by Tauri's webview and silently no-ops,
  // so use the native dialog plugin instead.
  const confirmed = await PluginDialog.ask("Delete this practice?", { title: "Confirm", kind: "warning" });
  if (!confirmed) return;
  await db.execute("DELETE FROM practices WHERE id = $1", [id]);
  showPracticesList();
  await loadPractices();
}

function initCrm() {
  $("#add-practice-btn").on("click", () => openAddPracticeModal());
  $("#practice-cancel-btn").on("click", closeAddPracticeModal);

  $("#practice-form").on("submit", (e) => {
    e.preventDefault();
    saveNewPractice();
  });

  $("#practices-tbody").on("click", "tr", function () {
    showPracticeDetail($(this).data("practice"));
  });

  $("#back-to-list-btn").on("click", showPracticesList);
  $("#detail-save-btn").on("click", saveDetailPractice);
  $("#detail-delete-btn").on("click", deleteDetailPractice);
}

$(async function () {
  initTabs();
  initCrm();

  db = await Database.load("sqlite:mapcrm.db");
  await loadPractices();

  // Served through Tauri's asset protocol (not the frontendDist static server) because
  // PMTiles needs HTTP Range support, which the plain dev/prod asset server doesn't provide.
  const pmtilesPath = await invoke("pmtiles_path");
  pmtilesUrl = convertFileSrc(pmtilesPath);
  setupMapLibre();
  map = createMap("map", BOSTON_CENTER, 11);
  await loadPractices();
});

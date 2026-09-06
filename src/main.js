import * as maplibregl from "/vendor/maplibre-gl/maplibre-gl.mjs";

const { convertFileSrc, invoke } = window.__TAURI__.core;
const Database = window.PluginSqlDatabase;

const BOSTON_CENTER = [-71.0589, 42.3601];

let map = null;
const practiceMarkers = new Map();

function initMap(pmtilesUrl) {
  // MapLibre's auto-detected worker script URL doesn't resolve correctly under Tauri's
  // production asset serving (it ends up empty, so the worker never starts) - set it explicitly.
  maplibregl.setWorkerUrl(new URL("/vendor/maplibre-gl/maplibre-gl-worker.mjs", window.location.href).href);

  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  return new maplibregl.Map({
    container: "map",
    style: {
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
    },
    center: BOSTON_CENTER,
    zoom: 11,
  });
}

function activateTab(tab) {
  $(".tab-button").removeClass("active");
  $(`.tab-button[data-tab="${tab}"]`).addClass("active");
  $(".tab-panel").removeClass("active");
  $(`#${tab}-panel`).addClass("active");
  if (tab === "map") {
    map?.resize();
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
    content.append(name, address);

    const popup = new maplibregl.Popup({ offset: 25 }).setDOMContent(content);
    const marker = new maplibregl.Marker()
      .setLngLat([practice.lng, practice.lat])
      .setPopup(popup)
      .addTo(map);

    practiceMarkers.set(practice.id, marker);
  }
}

function viewPracticeOnMap(practice) {
  if (practice.lat == null || practice.lng == null || !map) return;
  activateTab("map");
  map.flyTo({ center: [practice.lng, practice.lat], zoom: 15 });
  practiceMarkers.get(practice.id)?.togglePopup();
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

    const $actions = $("<td>").addClass("row-actions");
    if (practice.lat != null && practice.lng != null) {
      $("<button>").text("View on Map").addClass("view-map-btn").appendTo($actions);
    }
    $("<button>").text("Edit").addClass("edit-btn").appendTo($actions);
    $actions.appendTo($row);

    $tbody.append($row);
  }
}

function openPracticeModal(practice) {
  $("#practice-modal-title").text(practice ? "Edit Practice" : "Add Practice");
  $("#practice-id").val(practice?.id ?? "");
  $("#practice-name").val(practice?.name ?? "");
  $("#practice-contact-name").val(practice?.contact_name ?? "");
  $("#practice-phone").val(practice?.phone ?? "");
  $("#practice-email").val(practice?.email ?? "");
  $("#practice-address").val(practice?.address ?? "");
  $("#practice-notes").val(practice?.notes ?? "");
  $("#practice-geocode-status").text("");
  $("#practice-delete-btn").prop("hidden", !practice);
  $("#practice-modal").prop("hidden", false);
  $("#practice-name").trigger("focus");
}

function closePracticeModal() {
  $("#practice-modal").prop("hidden", true);
}

async function savePractice() {
  const id = $("#practice-id").val();
  const address = $("#practice-address").val().trim();
  const values = [
    $("#practice-name").val().trim(),
    $("#practice-contact-name").val().trim(),
    $("#practice-phone").val().trim(),
    $("#practice-email").val().trim(),
    address,
    $("#practice-notes").val().trim(),
  ];

  const $status = $("#practice-geocode-status");
  const $submitBtn = $("#practice-form button[type=submit]");
  $status.text(address ? "Locating address…" : "");
  $submitBtn.prop("disabled", true);

  let coords = null;
  try {
    coords = await invoke("geocode_address", { address });
  } catch {
    // Leave coords null - practice is still saved without map coordinates.
  }
  const [lat, lng] = coords ?? [null, null];
  if (address && coords == null) {
    $status.text("Couldn't locate this address on the map - saved without a pin.");
  }

  if (id) {
    await db.execute(
      `UPDATE practices SET name = $1, contact_name = $2, phone = $3, email = $4, address = $5, notes = $6,
       lat = $7, lng = $8, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $9`,
      [...values, lat, lng, id],
    );
  } else {
    await db.execute(
      "INSERT INTO practices (name, contact_name, phone, email, address, notes, lat, lng) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [...values, lat, lng],
    );
  }

  $submitBtn.prop("disabled", false);
  closePracticeModal();
  await loadPractices();
}

async function deletePractice(id) {
  // window.confirm() isn't implemented by Tauri's webview and silently no-ops,
  // so use the native dialog plugin instead.
  const confirmed = await PluginDialog.ask("Delete this practice?", { title: "Confirm", kind: "warning" });
  if (!confirmed) return;
  await db.execute("DELETE FROM practices WHERE id = $1", [id]);
  closePracticeModal();
  await loadPractices();
}

function initCrm() {
  $("#add-practice-btn").on("click", () => openPracticeModal(null));
  $("#practice-cancel-btn").on("click", closePracticeModal);

  $("#practice-form").on("submit", (e) => {
    e.preventDefault();
    savePractice();
  });

  $("#practices-tbody").on("click", ".edit-btn", function () {
    openPracticeModal($(this).closest("tr").data("practice"));
  });

  $("#practice-delete-btn").on("click", () => deletePractice($("#practice-id").val()));

  $("#practices-tbody").on("click", ".view-map-btn", function () {
    viewPracticeOnMap($(this).closest("tr").data("practice"));
  });
}

$(async function () {
  initTabs();
  initCrm();

  db = await Database.load("sqlite:mapcrm.db");
  await loadPractices();

  // Served through Tauri's asset protocol (not the frontendDist static server) because
  // PMTiles needs HTTP Range support, which the plain dev/prod asset server doesn't provide.
  const pmtilesPath = await invoke("pmtiles_path");
  map = initMap(convertFileSrc(pmtilesPath));
  await loadPractices();
});

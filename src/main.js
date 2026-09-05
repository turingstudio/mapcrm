import * as maplibregl from "/vendor/maplibre-gl/maplibre-gl.mjs";

const { convertFileSrc, invoke } = window.__TAURI__.core;
const Database = window.PluginSqlDatabase;

const BOSTON_CENTER = [-71.0589, 42.3601];

let map = null;

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

function initTabs() {
  $(".tab-button").on("click", function () {
    const tab = $(this).data("tab");
    $(".tab-button").removeClass("active");
    $(this).addClass("active");
    $(".tab-panel").removeClass("active");
    $(`#${tab}-panel`).addClass("active");
    if (tab === "map") {
      map?.resize();
    }
  });

  $('.tab-button[data-tab="crm"]').addClass("active");
  $("#crm-panel").addClass("active");
}

// --- CRM ---

let db = null;

async function loadPractices() {
  const rows = await db.select("SELECT * FROM practices ORDER BY name COLLATE NOCASE");
  renderPractices(rows);
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
    $("<button>").text("Edit").addClass("edit-btn").appendTo($actions);
    $("<button>").text("Delete").addClass("delete-btn").appendTo($actions);
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
  $("#practice-modal").prop("hidden", false);
  $("#practice-name").trigger("focus");
}

function closePracticeModal() {
  $("#practice-modal").prop("hidden", true);
}

async function savePractice() {
  const id = $("#practice-id").val();
  const values = [
    $("#practice-name").val().trim(),
    $("#practice-contact-name").val().trim(),
    $("#practice-phone").val().trim(),
    $("#practice-email").val().trim(),
    $("#practice-address").val().trim(),
    $("#practice-notes").val().trim(),
  ];

  if (id) {
    await db.execute(
      `UPDATE practices SET name = $1, contact_name = $2, phone = $3, email = $4, address = $5, notes = $6,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $7`,
      [...values, id],
    );
  } else {
    await db.execute(
      "INSERT INTO practices (name, contact_name, phone, email, address, notes) VALUES ($1, $2, $3, $4, $5, $6)",
      values,
    );
  }

  closePracticeModal();
  await loadPractices();
}

async function deletePractice(id) {
  if (!confirm("Delete this practice?")) return;
  await db.execute("DELETE FROM practices WHERE id = $1", [id]);
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

  $("#practices-tbody").on("click", ".delete-btn", function () {
    deletePractice($(this).closest("tr").data("practice").id);
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
});

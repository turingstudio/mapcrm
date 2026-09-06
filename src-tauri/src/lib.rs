use tauri::path::BaseDirectory;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn pmtiles_path(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .resolve("data/basemap.pmtiles", BaseDirectory::Resource)
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
struct NominatimResult {
    lat: String,
    lon: String,
}

// Geocoding runs in Rust (not JS fetch) because Nominatim's usage policy requires a
// custom User-Agent identifying the app, which browser fetch() cannot set.
#[tauri::command]
async fn geocode_address(address: String) -> Result<Option<(f64, f64)>, String> {
    if address.trim().is_empty() {
        return Ok(None);
    }

    let client = reqwest::Client::new();
    let response = client
        .get("https://nominatim.openstreetmap.org/search")
        .query(&[("q", address.as_str()), ("format", "json"), ("limit", "1")])
        .header("User-Agent", "mapcrm-desktop/0.1 (local single-user CRM)")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let results: Vec<NominatimResult> = response.json().await.map_err(|e| e.to_string())?;

    Ok(results
        .into_iter()
        .next()
        .and_then(|r| Some((r.lat.parse().ok()?, r.lon.parse().ok()?))))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create_practices",
        sql: "CREATE TABLE practices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            contact_name TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );",
        kind: MigrationKind::Up,
    }, Migration {
        version: 2,
        description: "add_practice_coordinates",
        sql: "ALTER TABLE practices ADD COLUMN lat REAL;",
        kind: MigrationKind::Up,
    }, Migration {
        version: 3,
        description: "add_practice_coordinates_lng",
        sql: "ALTER TABLE practices ADD COLUMN lng REAL;",
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:mapcrm.db", migrations)
                .build(),
        )
        .setup(|app| {
            let data_dir = app.path().resolve("data", BaseDirectory::Resource)?;
            app.asset_protocol_scope().allow_directory(data_dir, false)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, pmtiles_path, geocode_address])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn data_dir() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../src/data")
        .canonicalize()
        .expect("src/data directory should exist next to src-tauri")
}

#[tauri::command]
fn pmtiles_path() -> String {
    data_dir().join("basemap.pmtiles").to_string_lossy().into_owned()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.asset_protocol_scope().allow_directory(data_dir(), false)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, pmtiles_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

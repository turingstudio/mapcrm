use tauri::path::BaseDirectory;
use tauri::Manager;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().resolve("data", BaseDirectory::Resource)?;
            app.asset_protocol_scope().allow_directory(data_dir, false)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, pmtiles_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

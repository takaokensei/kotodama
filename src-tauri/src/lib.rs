// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
pub mod commands;
pub mod engine;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::subs::translate_batch_command,
            commands::files::open_subtitle_command,
            commands::files::save_subtitle_command,
            commands::ffmpeg::extract_subtitle_command,
            commands::ffmpeg::scan_subtitle_tracks_command,
            commands::ffmpeg::embed_subtitle_command,
            commands::files::save_project_command,
            commands::files::load_project_command,
            commands::settings::get_config_command,
            commands::settings::update_config_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

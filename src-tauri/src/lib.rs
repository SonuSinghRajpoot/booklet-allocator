mod allocation;
mod cleanup;
mod commands;
mod excel;
mod logging;

use commands::*;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon() {
                    let _ = window.set_icon(icon.clone());
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd_write_text_file,
            cmd_validate_input_file,
            cmd_generate_sample_file,
            cmd_run_allocation,
            cmd_write_output_files,
            cmd_append_audit_log,
            cmd_list_log_files,
            cmd_read_log_file,
            cmd_get_mac_address,
            cmd_run_log_cleanup,
            cmd_open_folder,
            cmd_build_audit_entry,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

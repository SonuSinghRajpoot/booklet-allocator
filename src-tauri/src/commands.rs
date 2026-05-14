use crate::allocation::{allocate, AllocationResult, CycleConfig, EvaluatorEntry, StudentRow};
use crate::excel::{
    generate_sample_file, validate_input_file, write_output_files, OutputRow, ValidationResult,
};
use crate::logging::{
    append_log_entry, get_mac_address, list_log_files, read_log_file, verify_log_password,
    AuditLogEntry, CycleLogEntry, EvaluatorLogEntry, SettingsSnapshot,
};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Manager;

// ---------------------------------------------------------------------------
// File validation
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn cmd_validate_input_file(
    path: String,
    student_id_column: String,
) -> Result<ValidationResult, String> {
    validate_input_file(&path, &student_id_column)
}

// ---------------------------------------------------------------------------
// Sample file generation
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn cmd_generate_sample_file(output_path: String) -> Result<(), String> {
    generate_sample_file(&output_path)
}

// ---------------------------------------------------------------------------
// Allocation (dry run — no file writes)
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RunCycleInput {
    pub cycle: CycleConfig,
    pub evaluators: Vec<EvaluatorEntry>,
}

#[tauri::command]
pub async fn cmd_run_allocation(
    master_data: Vec<StudentRow>,
    cycles: Vec<RunCycleInput>,
) -> Result<Vec<AllocationResult>, String> {
    let mut results = Vec::new();
    for input in &cycles {
        if input.evaluators.is_empty() {
            // Blank evaluator box → skip cycle silently
            continue;
        }
        let result = allocate(&master_data, &input.cycle, &input.evaluators)?;
        results.push(result);
    }
    Ok(results)
}

// ---------------------------------------------------------------------------
// Output file writing
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct WriteCycleInput {
    pub cycle_name: String,
    pub original_filename: String,
    pub output_dir: String,
    pub rows: Vec<OutputRow>,
}

#[tauri::command]
pub async fn cmd_write_output_files(
    cycles: Vec<WriteCycleInput>,
) -> Result<Vec<String>, String> {
    let mut written_paths = Vec::new();
    for input in &cycles {
        let path = write_output_files(
            &input.output_dir,
            &input.original_filename,
            &input.cycle_name,
            &input.rows,
        )?;
        written_paths.push(path);
    }
    Ok(written_paths)
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn cmd_append_audit_log(
    app: AppHandle,
    entry: AuditLogEntry,
) -> Result<(), String> {
    let logs_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("logs");
    append_log_entry(&logs_dir, &entry)
}

#[tauri::command]
pub async fn cmd_list_log_files(app: AppHandle) -> Result<Vec<String>, String> {
    let logs_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("logs");
    list_log_files(&logs_dir)
}

#[tauri::command]
pub async fn cmd_read_log_file(
    app: AppHandle,
    filename: String,
) -> Result<Vec<serde_json::Value>, String> {
    let logs_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("logs");
    let path = logs_dir.join(&filename);
    if !path.exists() {
        return Err(format!("Log file '{}' not found", filename));
    }
    read_log_file(&path)
}

// ---------------------------------------------------------------------------
// Password verification
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn cmd_verify_log_password(password: String) -> Result<bool, String> {
    verify_log_password(&password)
}

// ---------------------------------------------------------------------------
// MAC address
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn cmd_get_mac_address() -> Result<String, String> {
    Ok(get_mac_address())
}

// ---------------------------------------------------------------------------
// Log cleanup trigger (called from main on startup)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn cmd_run_log_cleanup(app: AppHandle) -> Result<(), String> {
    let logs_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("logs");
    crate::cleanup::run_log_rotation(logs_dir);
    Ok(())
}

// ---------------------------------------------------------------------------
// Open folder in explorer
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn cmd_open_folder(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(&path, None::<&str>)
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Plain text file write (used by LogViewer export — keeps fs plugin out of frontend)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn cmd_write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Build audit log entry helper (called from frontend before cmd_append_audit_log)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn cmd_build_audit_entry(
    nickname: String,
    settings_snapshot: SettingsSnapshot,
    input_filename: String,
    test_id: String,
    cycle_results: Vec<AllocationResult>,
) -> Result<AuditLogEntry, String> {
    let now = chrono::Local::now();
    let datetime = now.format("%Y-%m-%dT%H:%M:%S%z").to_string();
    let mac_address = get_mac_address();

    let cycles: Vec<CycleLogEntry> = cycle_results
        .iter()
        .map(|r| {
            let pool = r.pool_size as f64;
            CycleLogEntry {
                cycle_name: r.cycle_name.clone(),
                pool_size: r.pool_size,
                evaluators: r
                    .allocations
                    .iter()
                    .map(|a| EvaluatorLogEntry {
                        id: a.evaluator_id.clone(),
                        booklets: a.booklet_count,
                        share_pct: if pool > 0.0 {
                            (a.booklet_count as f64 / pool * 100.0 * 10.0).round() / 10.0
                        } else {
                            0.0
                        },
                        input_pct: a.explicit_pct,
                    })
                    .collect(),
            }
        })
        .collect();

    Ok(AuditLogEntry {
        datetime,
        nickname,
        mac_address,
        settings_snapshot,
        input_filename,
        test_id,
        cycles,
    })
}

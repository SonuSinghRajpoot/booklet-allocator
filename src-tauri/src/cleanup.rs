use chrono::{Duration, NaiveDate, Utc};
use std::fs;
use std::path::PathBuf;

/// Delete log files older than 120 days from the logs directory.
/// Called in a background thread so it never blocks the UI.
pub fn run_log_rotation(logs_dir: PathBuf) {
    std::thread::spawn(move || {
        let cutoff = (Utc::now() - Duration::days(120)).date_naive();

        let entries = match fs::read_dir(&logs_dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            // Expected format: YYYY-MM-DD.log.enc
            if let Some(date_part) = name.strip_suffix(".log.enc") {
                if let Ok(file_date) = NaiveDate::parse_from_str(date_part, "%Y-%m-%d") {
                    if file_date < cutoff {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
        }
    });
}

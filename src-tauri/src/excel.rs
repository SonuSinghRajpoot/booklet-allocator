use crate::allocation::StudentRow;
use calamine::{open_workbook, Data, Reader, Xlsx};
use rust_xlsxwriter::{Format, Workbook};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ValidationResult {
    pub master_data: Vec<StudentRow>,
    pub test_id: Option<String>,
    pub duplicate_count: u32,
    pub row_count: u32,
    pub headers: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OutputRow {
    pub test_id: String,
    pub evaluator_id: String,
    pub user_id: String,
}

// ---------------------------------------------------------------------------
// File-lock detection (Windows: try to open with exclusive share)
// ---------------------------------------------------------------------------

fn is_file_locked(path: &str) -> bool {
    use std::fs::OpenOptions;
    OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .is_err()
}

// ---------------------------------------------------------------------------
// Test-ID extraction: 0–7 numeric chars before the first `_`
// ---------------------------------------------------------------------------

pub fn extract_test_id(filename: &str) -> Option<String> {
    // Strip directory part
    let name = Path::new(filename)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(filename);

    let prefix = name.split('_').next().unwrap_or("");
    if prefix.is_empty() || prefix.len() > 7 {
        return None;
    }
    if prefix.chars().all(|c| c.is_ascii_digit()) && !prefix.is_empty() {
        Some(prefix.to_string())
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Input file validation
// ---------------------------------------------------------------------------

pub fn validate_input_file(
    path: &str,
    student_id_column: &str,
) -> Result<ValidationResult, String> {
    // 1. File-lock check
    if is_file_locked(path) {
        return Err(
            "This file is currently open in Excel. Please close it and try again.".to_string(),
        );
    }

    // 2. Open workbook
    let mut workbook: Xlsx<_> = open_workbook(path)
        .map_err(|e| format!("Failed to open file: {}", e))?;

    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or("Workbook has no sheets")?;

    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| format!("Failed to read sheet: {}", e))?;

    let rows: Vec<Vec<Data>> = range.rows().map(|r| r.to_vec()).collect();

    if rows.is_empty() {
        return Err("The file is empty.".to_string());
    }

    // 3. Detect merged/title header row
    // Strategy: check if the expected student column header exists in row 0.
    // If not, check row 1 (indicating row 0 is a merged title row).
    let header_row_idx = detect_header_row(&rows, student_id_column)?;
    let header_row = &rows[header_row_idx];

    // Build column index map
    let headers: Vec<String> = header_row
        .iter()
        .map(|c| cell_to_string(c))
        .collect();

    let student_col_idx = headers
        .iter()
        .position(|h| h.eq_ignore_ascii_case(student_id_column))
        .ok_or_else(|| {
            format!(
                "Column '{}' not found. Available columns: {}",
                student_id_column,
                headers.join(", ")
            )
        })?;

    // 4. Parse data rows, strip blanks
    let data_rows = &rows[header_row_idx + 1..];
    let mut student_rows: Vec<StudentRow> = Vec::new();

    for row in data_rows {
        // Strip blank rows (all cells empty)
        if row.iter().all(|c| matches!(c, Data::Empty)) {
            continue;
        }

        let id = row
            .get(student_col_idx)
            .map(cell_to_string)
            .unwrap_or_default();

        if id.is_empty() {
            continue;
        }

        let mut data: HashMap<String, String> = HashMap::new();
        for (col_i, header) in headers.iter().enumerate() {
            if !header.is_empty() {
                let val = row.get(col_i).map(cell_to_string).unwrap_or_default();
                data.insert(header.clone(), val);
            }
        }

        student_rows.push(StudentRow { id, data });
    }

    // 5. Deduplicate student IDs
    let original_count = student_rows.len();
    let mut seen: HashSet<String> = HashSet::new();
    student_rows.retain(|r| seen.insert(r.id.clone()));
    let duplicate_count = (original_count - student_rows.len()) as u32;
    let row_count = student_rows.len() as u32;

    // 6. Extract test ID from filename
    let test_id = extract_test_id(path);

    Ok(ValidationResult {
        master_data: student_rows,
        test_id,
        duplicate_count,
        row_count,
        headers,
    })
}

fn detect_header_row(rows: &[Vec<Data>], student_col: &str) -> Result<usize, String> {
    // Check row 0 first
    if let Some(row0) = rows.get(0) {
        let has_header = row0
            .iter()
            .any(|c| cell_to_string(c).eq_ignore_ascii_case(student_col));
        if has_header {
            return Ok(0);
        }
    }
    // Fall back to row 1 (merged title row scenario)
    if let Some(row1) = rows.get(1) {
        let has_header = row1
            .iter()
            .any(|c| cell_to_string(c).eq_ignore_ascii_case(student_col));
        if has_header {
            return Ok(1);
        }
    }
    Err(format!(
        "Could not find column '{}' in row 0 or row 1. \
         If your file has a merged title row, ensure the column headers are in row 2.",
        student_col
    ))
}

fn cell_to_string(cell: &Data) -> String {
    match cell {
        Data::String(s) => s.clone(),
        Data::Float(f) => {
            if f.fract() == 0.0 {
                format!("{}", *f as i64)
            } else {
                format!("{}", f)
            }
        }
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => b.to_string(),
        Data::Error(_) => String::new(),
        Data::Empty => String::new(),
        Data::DateTimeIso(s) => s.clone(),
        Data::DurationIso(s) => s.clone(),
        _ => String::new(),
    }
}

// ---------------------------------------------------------------------------
// Output file generation
// ---------------------------------------------------------------------------

pub fn write_output_files(
    output_dir: &str,
    original_filename: &str,
    cycle_name: &str,
    rows: &[OutputRow],
) -> Result<String, String> {
    let out_name = format!("{} - {}", cycle_name, original_filename);
    let out_path = Path::new(output_dir).join(&out_name);

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();

    let bold = Format::new().set_bold();

    worksheet
        .write_with_format(0, 0, "Test Id", &bold)
        .map_err(|e| e.to_string())?;
    worksheet
        .write_with_format(0, 1, "Evaluator Id", &bold)
        .map_err(|e| e.to_string())?;
    worksheet
        .write_with_format(0, 2, "User Id", &bold)
        .map_err(|e| e.to_string())?;

    for (i, row) in rows.iter().enumerate() {
        let r = (i + 1) as u32;
        worksheet.write(r, 0, &row.test_id).map_err(|e| e.to_string())?;
        worksheet
            .write(r, 1, &row.evaluator_id)
            .map_err(|e| e.to_string())?;
        worksheet.write(r, 2, &row.user_id).map_err(|e| e.to_string())?;
    }

    workbook
        .save(&out_path)
        .map_err(|e| format!("Failed to write {}: {}", out_name, e))?;

    Ok(out_path.to_string_lossy().to_string())
}

// ---------------------------------------------------------------------------
// Sample file generation
// ---------------------------------------------------------------------------

pub fn generate_sample_file(output_path: &str) -> Result<(), String> {
    let mut workbook = Workbook::new();
    let ws = workbook.add_worksheet();

    // Merged title row spanning A1:C1
    let title_fmt = Format::new().set_bold().set_align(rust_xlsxwriter::FormatAlign::Center);
    ws.merge_range(0, 0, 0, 2, "Sample Exam Booklets — TID1234", &title_fmt)
        .map_err(|e| e.to_string())?;

    // Header row
    let bold = Format::new().set_bold();
    ws.write_with_format(1, 0, "Member Id", &bold)
        .map_err(|e| e.to_string())?;
    ws.write_with_format(1, 1, "Email", &bold)
        .map_err(|e| e.to_string())?;
    ws.write_with_format(1, 2, "Name", &bold)
        .map_err(|e| e.to_string())?;

    // 50 fake student records
    let first_names = ["Alice", "Bob", "Carol", "David", "Eva", "Frank", "Grace", "Henry",
                        "Irene", "Jack"];
    let last_names  = ["Smith", "Jones", "Brown", "Taylor", "Wilson", "Davis", "Clark",
                        "Lewis", "Lee", "Hall"];

    for i in 0..50u32 {
        let fn_ = first_names[(i as usize) % first_names.len()];
        let ln  = last_names[(i as usize) % last_names.len()];
        let member_id = format!("M{:04}", 1000 + i);
        let email = format!("{}.{}{}@example.com", fn_.to_lowercase(), ln.to_lowercase(), i);
        let name  = format!("{} {}", fn_, ln);
        ws.write(i + 2, 0, &member_id).map_err(|e| e.to_string())?;
        ws.write(i + 2, 1, &email).map_err(|e| e.to_string())?;
        ws.write(i + 2, 2, &name).map_err(|e| e.to_string())?;
    }

    workbook
        .save(output_path)
        .map_err(|e| format!("Failed to save sample file: {}", e))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_test_id_normal() {
        assert_eq!(
            extract_test_id("TID1234_booklets.xlsx"),
            None // "TID1234" has non-digit chars
        );
        assert_eq!(
            extract_test_id("1234_booklets.xlsx"),
            Some("1234".to_string())
        );
        assert_eq!(
            extract_test_id("9999999_exam.xlsx"),
            Some("9999999".to_string())
        );
    }

    #[test]
    fn test_extract_test_id_too_long() {
        // 8 digits → exceeds 7 char limit
        assert_eq!(extract_test_id("12345678_booklets.xlsx"), None);
    }

    #[test]
    fn test_extract_test_id_no_underscore() {
        assert_eq!(extract_test_id("booklets.xlsx"), None);
    }

    #[test]
    fn test_extract_test_id_path() {
        assert_eq!(
            extract_test_id("C:/Users/test/1234_file.xlsx"),
            Some("1234".to_string())
        );
    }

    #[test]
    fn test_cell_to_string_float_whole() {
        let c = Data::Float(42.0);
        assert_eq!(cell_to_string(&c), "42");
    }

    #[test]
    fn test_cell_to_string_float_decimal() {
        let c = Data::Float(3.14);
        assert_eq!(cell_to_string(&c), "3.14");
    }

    #[test]
    fn test_cell_to_string_empty() {
        assert_eq!(cell_to_string(&Data::Empty), "");
    }
}

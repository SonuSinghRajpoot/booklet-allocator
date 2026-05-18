use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// Compile-time AES-256 key obfuscation via XOR macro
// The actual key = MASKED_KEY ^ KEY_MASK (both are arrays of literals)
// ---------------------------------------------------------------------------

macro_rules! xor_bytes {
    ([$($a:literal),*], [$($b:literal),*]) => {
        [$($a ^ $b),*]
    };
}

#[rustfmt::skip]
const AES_KEY: [u8; 32] = xor_bytes!(
    // Masked key bytes (actual_key XOR mask stored here)
    [0x71,0x01,0x29,0x04,0xa1,0xeb,0x79,0x6b,
     0x44,0xf6,0x36,0xcd,0x6e,0x46,0xe4,0xf1,
     0x39,0x4a,0x43,0x0e,0xb2,0x12,0x0c,0x56,
     0xba,0xd5,0x66,0xcc,0x5c,0xa5,0x38,0xb4],
    // Mask bytes
    [0x5a,0x7f,0x3c,0x12,0x89,0x45,0xab,0xcd,
     0xef,0x01,0x23,0x45,0x67,0x89,0xab,0xcd,
     0x12,0x34,0x56,0x78,0x9a,0xbc,0xde,0xf0,
     0x11,0x22,0x33,0x44,0x55,0x66,0x77,0x88]
);

// ---------------------------------------------------------------------------
// Log entry types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EvaluatorLogEntry {
    pub id: String,
    pub booklets: usize,
    pub share_pct: f64,
    pub input_pct: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CycleLogEntry {
    pub cycle_name: String,
    pub pool_size: usize,
    pub evaluators: Vec<EvaluatorLogEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SettingsSnapshot {
    pub cycles: Vec<serde_json::Value>,
    pub student_field: String,
    pub evaluator_field: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuditLogEntry {
    pub datetime: String,
    pub nickname: String,
    pub mac_address: String,
    pub settings_snapshot: SettingsSnapshot,
    pub input_filename: String,
    pub test_id: String,
    pub cycles: Vec<CycleLogEntry>,
}

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------

fn get_cipher() -> Aes256Gcm {
    Aes256Gcm::new_from_slice(&AES_KEY).expect("AES key length is always 32 bytes")
}

pub fn encrypt(plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = get_cipher();
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|e| format!("Encryption failed: {}", e))?;
    let mut result = nonce.to_vec(); // 12 bytes nonce
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

pub fn decrypt(data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 12 {
        return Err("Data too short to contain a valid nonce".to_string());
    }
    let cipher = get_cipher();
    let (nonce_bytes, ciphertext) = data.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Decryption failed — file may be tampered or corrupt".to_string())
}

// ---------------------------------------------------------------------------
// Log file I/O
// ---------------------------------------------------------------------------

pub fn log_file_path(logs_dir: &PathBuf, date: &str) -> PathBuf {
    logs_dir.join(format!("{}.log.enc", date))
}

pub fn today_string() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

/// Append an entry to today's encrypted log file.
pub fn append_log_entry(logs_dir: &PathBuf, entry: &AuditLogEntry) -> Result<(), String> {
    fs::create_dir_all(logs_dir).map_err(|e| e.to_string())?;

    let today = today_string();
    let path = log_file_path(logs_dir, &today);

    // Read + decrypt existing content, or start fresh
    let mut existing_json = if path.exists() {
        let encrypted = fs::read(&path).map_err(|e| e.to_string())?;
        let plain = decrypt(&encrypted)?;
        String::from_utf8(plain).map_err(|e| e.to_string())?
    } else {
        String::new()
    };

    // Append new entry as newline-delimited JSON
    let new_line = serde_json::to_string(entry).map_err(|e| e.to_string())?;
    if !existing_json.is_empty() && !existing_json.ends_with('\n') {
        existing_json.push('\n');
    }
    existing_json.push_str(&new_line);
    existing_json.push('\n');

    // Encrypt and write
    let encrypted = encrypt(existing_json.as_bytes())?;
    fs::write(&path, &encrypted).map_err(|e| e.to_string())?;

    Ok(())
}

/// Read and decrypt all entries from a log file.
pub fn read_log_file(path: &PathBuf) -> Result<Vec<serde_json::Value>, String> {
    let encrypted = fs::read(path).map_err(|e| e.to_string())?;
    let plain = decrypt(&encrypted)?;
    let text = String::from_utf8(plain).map_err(|e| e.to_string())?;

    let mut entries = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<serde_json::Value>(line) {
            Ok(v) => entries.push(v),
            Err(_) => entries.push(serde_json::json!({
                "error": "⚠ This log entry could not be parsed. It may be corrupt."
            })),
        }
    }
    Ok(entries)
}

/// List all .log.enc files in the logs directory.
pub fn list_log_files(logs_dir: &PathBuf) -> Result<Vec<String>, String> {
    if !logs_dir.exists() {
        return Ok(vec![]);
    }
    let mut files: Vec<String> = fs::read_dir(logs_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".log.enc") {
                Some(name)
            } else {
                None
            }
        })
        .collect();
    files.sort();
    files.reverse(); // newest first
    Ok(files)
}

/// Get MAC address as a string.
pub fn get_mac_address() -> String {
    mac_address::get_mac_address()
        .ok()
        .flatten()
        .map(|ma| ma.to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

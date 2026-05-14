use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2,
};
use std::env;
use std::fs;
use std::path::Path;

fn main() {
    println!("cargo:rerun-if-env-changed=ALLOCATOR_LOG_PASSWORD");

    let out_dir = env::var("OUT_DIR").expect("OUT_DIR not set");
    let dest_path = Path::new(&out_dir).join("log_password_hash.rs");

    let content = match env::var("ALLOCATOR_LOG_PASSWORD") {
        Ok(password) if !password.is_empty() => {
            // Encode a fixed byte sequence as PHC-B64 salt — no RNG required.
            // SaltString::encode_b64 is the correct password-hash 0.5 API for
            // creating a deterministic salt from raw bytes (8–64 bytes).
            let salt = SaltString::encode_b64(b"booklet-allocator-build-salt")
                .expect("fixed salt bytes are within valid length range");
            let hash = Argon2::default()
                .hash_password(password.as_bytes(), &salt)
                .expect("argon2 hashing failed")
                .to_string();
            format!(
                "pub const LOG_PASSWORD_HASH: Option<&str> = Some({:?});",
                hash
            )
        }
        _ => "pub const LOG_PASSWORD_HASH: Option<&str> = None;".to_string(),
    };

    fs::write(&dest_path, content).expect("Failed to write log_password_hash.rs");

    tauri_build::build();
}

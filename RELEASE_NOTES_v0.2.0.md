## Booklet Allocator v0.2.0

**Released:** 2026-05-18

### What's new

#### 🔓 Open audit log access
The Log Viewer is now always accessible — no password required. Click the **📋 Logs** button in the main header or press **Ctrl+Shift+L** from anywhere in the app to open it instantly. All log files remain encrypted on disk with AES-256-GCM, so they are still tamper-evident and cannot be read or modified outside the application.

#### 📋 Logs button in the header
A dedicated **Logs** button is now permanently visible in the top-right header of the main screen, alongside the Settings button.

#### 📅 Log Viewer — date-range search
The Log Viewer has been redesigned with three clear sections:
- **Load a specific day** — pick any date from the dropdown and click **Load**
- **Load by date range** — set a From / To date and click **🔍 Search** to merge entries from all matching log files in one go
- **Filter loaded entries** — narrow results live by MAC address, cycle name, or filename (no extra button needed)

#### 📝 Output column rename
The second column in all generated allocation Excel files is now labelled **Evaluator Ids** (previously **Evaluator Id**) to better reflect that multiple evaluators can be assigned across cycles.

### Under the hood
- Removed `argon2` from both runtime and build dependencies — smaller binary, faster compile times
- `build.rs` simplified to a single `tauri_build::build()` call
- `cmd_verify_log_password` Tauri command removed entirely

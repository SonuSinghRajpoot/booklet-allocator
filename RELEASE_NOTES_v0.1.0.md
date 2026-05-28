# Booklet Allocator v0.1.0

> **Initial release** — a desktop tool for allocating exam booklets to evaluators across multiple exam cycles.

---

## ✨ Features

### 📂 File Input
- Load student data from Excel (`.xlsx`) files
- Automatic merged-header row detection
- Duplicate student ID removal with warning count
- Test ID silently extracted from the filename

### ⚙️ Allocation Engine
- Configure multiple exam cycles, each with an independent pool percentage
- Assign evaluators with optional explicit percentage splits
- Unassigned remainder distributed evenly among free evaluators
- Largest-remainder method ensures no booklet is left unallocated
- Live preview of allocation results before writing any files

### 👤 Evaluator Input
- Per-cycle evaluator boxes with auto-resize as you type
- Supports **Member ID** or **Email** identifier mode (configurable in Settings)
- Input validation enforces the correct identifier type per setting
- Cross-cycle duplicate evaluator warnings with dismiss option

### 📤 Output
- Generates one Excel output file per cycle, named after the input file and cycle
- Open output folder directly from the Summary screen

### 🔒 Audit Logging
- Every allocation is encrypted and appended to a daily log file (**AES-256-GCM**)
- Log Viewer with filters: date range, MAC address, cycle name, filename
- Each log entry records evaluator ID, input percentage, booklets assigned, and share %
- Export visible entries as `.txt` or `.csv`
- Password-gated log access (configured at build time via `ALLOCATOR_LOG_PASSWORD`)

### 🛠 Settings
- Named presets to save and restore full cycle + evaluator configurations
- Configurable student and evaluator identifier fields (Member ID / Email)
- Download sample Excel file to understand the expected input format
- Drag-to-reorder exam cycles

### 🎨 UI / UX
- Light and dark mode with OS title bar sync
- Custom academic-cap app icon
- Compact, responsive layout with scrollable content area
- Session state resets automatically on every app launch

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + O` | Open file picker |
| `Ctrl + Enter` | Preview allocation |
| `Ctrl + ,` | Open settings |
| `Ctrl + Shift + L` | Open log viewer (password gated) |

---

## 💾 Installation

| File | Type | Recommended |
|---|---|---|
| `Booklet Allocator_0.1.0_x64-setup.exe` | NSIS Installer | ✅ Yes |
| `Booklet Allocator_0.1.0_x64_en-US.msi` | MSI Package | Optional |

**Requirements:** Windows 10 / 11 (x64)

---

## 🔧 Build Configuration

> The log viewer password must be set at build time via the `ALLOCATOR_LOG_PASSWORD` environment variable. If not set, the log viewer will display a configuration error when accessed.

```powershell
$env:ALLOCATOR_LOG_PASSWORD = "your-password"
npm run tauri build
```

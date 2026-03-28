# ◈ Bookmark Nexus

**Universal Bookmark Manager** — Aggregates bookmarks from all major browsers with blazing-fast search, bulk operations, tags, and analytics.

---

## Features

| Feature | Details |
|---|---|
| **Auto-detect browsers** | Chrome, Firefox, Edge, Brave, Opera, Vivaldi — reads directly from their profile files |
| **Real SQLite backend** | `better-sqlite3` + FTS5 full-text search, WAL mode, indexed for 1M+ records |
| **Firefox support** | Reads `places.sqlite` directly (copies to temp to avoid lock) |
| **Chromium support** | Parses Chrome/Edge/Brave/Opera JSON bookmark files |
| **Netscape HTML** | Import exported bookmarks from any browser |
| **Virtual scroll** | Renders only visible rows — handles 100,000+ bookmarks at 60fps |
| **Bulk operations** | Multi-select, bulk delete, bulk export, bulk tag |
| **Search** | FTS5 full-text search across title, URL, folder — <5ms for 10k records |
| **Tags** | Assign tags to any bookmark, filter by tag |
| **Analytics panel** | Browser breakdown, top folders, top domains, charts |
| **Duplicate detection** | One-click remove all duplicates |
| **Export** | Export all or selected to Netscape HTML (re-importable into any browser) |
| **Context menu** | Right-click any bookmark for quick actions |
| **Keyboard shortcuts** | `Ctrl+F` search, `Ctrl+A` select all, `Delete` bulk delete, `Esc` deselect |

---

## Setup

### Prerequisites

- **Node.js** 18+
- **npm** 9+

### Install

```bash
# Clone / extract the project
cd bookmark-nexus

# Install all dependencies
npm install

# Install renderer dependencies
npm install react react-dom @vitejs/plugin-react vite
```

### Development (with hot reload)

```bash
# Terminal 1: Start Vite dev server
npx vite

# Terminal 2: Start Electron (after Vite is running)
npx electron .
```

Or with concurrently:
```bash
npm run dev
```

### Build for distribution

```bash
npm run build
```

This creates:
- `dist/` — compiled renderer
- `dist-app/` — platform installer (`.exe`, `.dmg`, `.AppImage`)

---

## Architecture

```
bookmark-nexus/
├── src/
│   ├── main/
│   │   ├── main.js          # Electron main process
│   │   │                      - Browser path detection (Win/Mac/Linux)
│   │   │                      - SQLite DB (better-sqlite3 + FTS5)
│   │   │                      - Chromium JSON parser
│   │   │                      - Firefox SQLite parser
│   │   │                      - Netscape HTML parser
│   │   │                      - All IPC handlers
│   │   └── preload.js       # Secure IPC bridge (contextBridge)
│   │
│   └── renderer/
│       ├── App.jsx           # Root component, state management
│       ├── components/
│       │   ├── Titlebar      # App header with live stats
│       │   ├── Sidebar       # Navigation, browser list, folders, tags
│       │   ├── Toolbar       # Search, sort, view toggle, selection bar
│       │   ├── BookmarkList  # Virtual scroll list + grid view
│       │   ├── AnalyticsPanel# Charts and statistics
│       │   ├── ImportModal   # Browser detection + file import
│       │   └── Modals        # TagModal, EditModal, ContextMenu, etc.
│       └── styles/           # CSS Modules
│
├── index.html
├── vite.config.js
└── package.json
```

---

## Browser File Locations

### Windows
| Browser | Path |
|---|---|
| Chrome | `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Bookmarks` |
| Edge | `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Bookmarks` |
| Brave | `%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Default\Bookmarks` |
| Opera | `%APPDATA%\Opera Software\Opera Stable\Bookmarks` |
| Firefox | `%APPDATA%\Mozilla\Firefox\Profiles\*.default\places.sqlite` |

### macOS
| Browser | Path |
|---|---|
| Chrome | `~/Library/Application Support/Google/Chrome/Default/Bookmarks` |
| Edge | `~/Library/Application Support/Microsoft Edge/Default/Bookmarks` |
| Firefox | `~/Library/Application Support/Firefox/Profiles/*.default/places.sqlite` |

### Linux
| Browser | Path |
|---|---|
| Chrome | `~/.config/google-chrome/Default/Bookmarks` |
| Firefox | `~/.mozilla/firefox/*.default/places.sqlite` |

---

## Database Schema

```sql
-- Main bookmarks table with FTS5 index
CREATE TABLE bookmarks (
  id           INTEGER PRIMARY KEY,
  title        TEXT,
  url          TEXT,
  folder_path  TEXT,
  browser      TEXT,
  tags         TEXT,      -- JSON array ["tag1", "tag2"]
  date_added   INTEGER,   -- Unix timestamp
  url_hash     TEXT,      -- For duplicate detection
  is_dead      INTEGER    -- For dead link detection
);

-- Full-text search
CREATE VIRTUAL TABLE bookmarks_fts USING fts5(
  title, url, folder_path, tags,
  content=bookmarks
);

-- Tags
CREATE TABLE tags (id, name, color);
CREATE TABLE bookmark_tags (bookmark_id, tag_id);
```

---

## Performance

- **10,000 bookmarks**: loads in ~20ms, search <5ms
- **100,000 bookmarks**: loads in ~100ms, search <15ms  
- **Virtual scroll**: only renders visible rows regardless of total count
- **SQLite WAL mode**: concurrent reads, fast writes
- **FTS5**: full-text search faster than LIKE queries by 10-100x

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + F` | Focus search |
| `Ctrl/Cmd + A` | Select all visible |
| `Delete` | Delete selected |
| `Escape` | Deselect all / close modal |
| Right-click | Context menu |

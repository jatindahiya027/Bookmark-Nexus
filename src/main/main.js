const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ─── sql.js ───────────────────────────────────────────────────────────────────
let SQL = null;
let db  = null;
let dbFilePath = '';
let mem = { bookmarks: [], nextId: 1 };
let useMem = false;

async function initDB() {
  dbFilePath = path.join(app.getPath('userData'), 'bookmarks.db');
  try {
    SQL = await require('sql.js')();
    db  = fs.existsSync(dbFilePath)
      ? new SQL.Database(fs.readFileSync(dbFilePath))
      : new SQL.Database();
    db.run(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        title        TEXT NOT NULL DEFAULT '',
        url          TEXT NOT NULL,
        folder_path  TEXT DEFAULT '',
        browser      TEXT NOT NULL DEFAULT 'unknown',
        tags         TEXT DEFAULT '[]',
        date_added   INTEGER DEFAULT 0,
        is_dead      INTEGER DEFAULT 0,
        url_hash     TEXT,
        created_at   INTEGER DEFAULT 0
      );
    `);

    // ── Migrations (safe to run on every launch) ──────────────────────────────
    try { db.run(`ALTER TABLE bookmarks ADD COLUMN native_id  TEXT    DEFAULT ''`); } catch(_) {}
    try { db.run(`ALTER TABLE bookmarks ADD COLUMN is_deleted INTEGER DEFAULT 0`);  } catch(_) {}
    try { db.run(`ALTER TABLE bookmarks ADD COLUMN deleted_at INTEGER DEFAULT 0`);  } catch(_) {}
    try { db.run(`ALTER TABLE bookmarks ADD COLUMN is_liked    INTEGER DEFAULT 0`);  } catch(_) {}
    // user_added=1 means user manually pasted this URL (browser='user') — can be hard-deleted from Deleted
    try { db.run(`ALTER TABLE bookmarks ADD COLUMN user_added  INTEGER DEFAULT 0`);  } catch(_) {}

    // Step 1: Fix any rows that have NULL or empty url_hash — they defeat dedup.
    // Recompute url_hash from url for these rows so the unique index can cover them.
    try {
      const badRows = qAll(`SELECT id, url FROM bookmarks WHERE url_hash IS NULL OR url_hash = ''`);
      if (badRows.length > 0) {
        console.log(`[initDB] Recomputing url_hash for ${badRows.length} rows with missing hash`);
        db.run('BEGIN');
        for (const row of badRows) {
          db.run(`UPDATE bookmarks SET url_hash=? WHERE id=?`, [hash(row.url || ''), row.id]);
        }
        db.run('COMMIT');
      }
    } catch(e) { console.error('[initDB] url_hash repair error:', e.message); }

    // Step 2: Deduplicate — keep MIN(rowid) for each (url_hash, browser) pair.
    // MUST succeed before we can create a unique index.
    try {
      const before = qGet('SELECT COUNT(*) as c FROM bookmarks')?.c || 0;
      db.run(`
        DELETE FROM bookmarks WHERE rowid NOT IN (
          SELECT MIN(rowid) FROM bookmarks GROUP BY url_hash, browser
        )
      `);
      const after = qGet('SELECT COUNT(*) as c FROM bookmarks')?.c || 0;
      if (before - after > 0) console.log(`[initDB] Removed ${before - after} duplicate rows`);
    } catch(e) { console.error('[initDB] dedup error:', e.message); }

    // Step 3: Drop old index if it exists (might have been created without UNIQUE)
    try { db.run(`DROP INDEX IF EXISTS idx_hash`); } catch(_) {}

    // Step 4: Create UNIQUE index. If this still fails, log the exact reason.
    try {
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_bm ON bookmarks(url_hash, browser)`);
      console.log('[initDB] Unique index (url_hash, browser) — OK');
    } catch(e) {
      console.error('[initDB] UNIQUE INDEX CREATION FAILED:', e.message);
      // Diagnose: find remaining duplicate pairs
      const dupes = qAll(`
        SELECT url_hash, browser, COUNT(*) as cnt
        FROM bookmarks
        GROUP BY url_hash, browser
        HAVING cnt > 1
        LIMIT 5
      `);
      console.error('[initDB] Remaining duplicate pairs sample:', JSON.stringify(dupes));
    }

    // Step 5: Verify the unique index actually exists
    const indexes = qAll(`SELECT name, "unique" FROM sqlite_master WHERE type='index' AND tbl_name='bookmarks'`);
    console.log('[initDB] Active indexes:', indexes.map(i => i.name).join(', '));
    const hasUnique = indexes.some(i => i.name === 'idx_unique_bm');
    if (!hasUnique) {
      console.error('[initDB] WARNING: unique index NOT present — duplicates will not be prevented!');
    }

    try { db.run(`CREATE INDEX IF NOT EXISTS idx_browser ON bookmarks(browser)`);  } catch(_) {}
    try { db.run(`CREATE INDEX IF NOT EXISTS idx_date    ON bookmarks(date_added)`); } catch(_) {}

    save();
    console.log('[initDB] DB ready:', dbFilePath, '| total rows:', qGet('SELECT COUNT(*) as c FROM bookmarks')?.c || 0);
  } catch(e) {
    console.error('sql.js failed, using JS store:', e.message);
    useMem = true;
  }
}

function save() {
  if (!db||useMem) return;
  try { fs.writeFileSync(dbFilePath, Buffer.from(db.export())); } catch(_) {}
}

// ─── sql.js helpers ───────────────────────────────────────────────────────────
function qAll(sql, p=[]) {
  if (!db) return [];
  try { const s=db.prepare(sql); s.bind(p); const r=[]; while(s.step()) r.push(s.getAsObject()); s.free(); return r; }
  catch(e) { console.error('qAll:',e.message); return []; }
}
function qGet(sql,p=[]) { return qAll(sql,p)[0]||null; }
function qRun(sql,p=[]) {
  if (!db) return 0;
  try { db.run(sql,p); return qGet('SELECT changes() as c')?.c||0; }
  catch(e) { console.error('qRun:',e.message); return 0; }
}
function qAllFrom(database,sql,p=[]) {
  try { const s=database.prepare(sql); s.bind(p); const r=[]; while(s.step()) r.push(s.getAsObject()); s.free(); return r; }
  catch(e) { console.error('qAllFrom:',e.message); return []; }
}

// ─── BROWSER PATHS ────────────────────────────────────────────────────────────
// Returns: { browserKey: { paths: string[], type: 'chromium'|'firefox'|'chromium-zen' } }
function getBrowserDefs() {
  const home = os.homedir();
  const plat = process.platform;
  const defs = {};

  function chromium(key, paths) { defs[key] = { paths, type: 'chromium' }; }
  function firefox(key, paths) { defs[key] = { paths, type: 'firefox'  }; }

  if (plat === 'win32') {
    const L = process.env.LOCALAPPDATA || path.join(home,'AppData','Local');
    const R = process.env.APPDATA       || path.join(home,'AppData','Roaming');

    chromium('chrome',   [L+'/Google/Chrome/User Data/Default/Bookmarks',
                          L+'/Google/Chrome/User Data/Profile 1/Bookmarks']);
    chromium('edge',     [L+'/Microsoft/Edge/User Data/Default/Bookmarks']);
    chromium('brave',    [L+'/BraveSoftware/Brave-Browser/User Data/Default/Bookmarks']);
    chromium('opera',    [R+'/Opera Software/Opera Stable/Bookmarks',
                          R+'/Opera Software/Opera GX Stable/Bookmarks']);
    chromium('vivaldi',  [L+'/Vivaldi/User Data/Default/Bookmarks']);
    // Arc is macOS-only — no Windows path
    defs['arc'] = { paths: [], type: 'chromium' };

    // Firefox
    const ffBase = R+'/Mozilla/Firefox/Profiles';
    const ffPaths = [];
    if (fs.existsSync(ffBase))
      fs.readdirSync(ffBase)
        .filter(p => p.endsWith('.default-release') || p.endsWith('.default') || p.toLowerCase().includes('default'))
        .forEach(p => ffPaths.push(ffBase+'/'+p+'/places.sqlite'));
    firefox('firefox', ffPaths);

    // Zen Browser on Windows — uses Firefox engine (NOT Chromium)
    // Profile folder naming: "<hash>.Default (release)" — note capital D, space, parens
    // e.g.: C:\Users\<user>\AppData\Roaming\zen\Profiles\0d1x55z0.Default (release)\places.sqlite
    const zenPaths = [];
    for (const zenBase of [R+'/zen/Profiles', R+'/Zen/Profiles']) {
      if (fs.existsSync(zenBase)) {
        try {
          fs.readdirSync(zenBase).forEach(p => {
            const lp = p.toLowerCase();
            // Match any of: .default-release  .default  .Default (release)  Default (release)
            if (lp.includes('default') || lp.includes('release')) {
              const candidate = zenBase+'/'+p+'/places.sqlite';
              if (fs.existsSync(candidate)) zenPaths.push(candidate);
            }
          });
        } catch(_) {}
      }
    }
    // Zen is always firefox-engine on Windows — register as 'zen' with firefox type
    firefox('zen', zenPaths);

  } else if (plat === 'darwin') {
    const L = home+'/Library/Application Support';

    chromium('chrome',   [L+'/Google/Chrome/Default/Bookmarks']);
    chromium('edge',     [L+'/Microsoft Edge/Default/Bookmarks']);
    chromium('brave',    [L+'/BraveSoftware/Brave-Browser/Default/Bookmarks']);
    chromium('opera',    [L+'/com.operasoftware.Opera/Bookmarks']);
    chromium('vivaldi',  [L+'/Vivaldi/Default/Bookmarks']);

    // Zen Browser — uses Firefox engine on macOS
    const zenProfile = home+'/Library/Application Support/Zen/Profiles';
    const zenPaths = [];
    if (fs.existsSync(zenProfile))
      fs.readdirSync(zenProfile).filter(p=>p.endsWith('.default-release')||p.endsWith('.default'))
        .forEach(p => zenPaths.push(zenProfile+'/'+p+'/places.sqlite'));
    // Also check alternate Zen location
    const zenAlt = home+'/Library/Application Support/zen/Profiles';
    if (fs.existsSync(zenAlt))
      fs.readdirSync(zenAlt).filter(p=>p.endsWith('.default-release')||p.endsWith('.default'))
        .forEach(p => zenPaths.push(zenAlt+'/'+p+'/places.sqlite'));
    firefox('zen', zenPaths);

    // Arc Browser — Chromium-based, macOS only
    // Arc stores in its own profile directory
    chromium('arc', [
      home+'/Library/Application Support/Arc/User Data/Default/Bookmarks',
      home+'/Library/Application Support/Arc/User Data/Profile 1/Bookmarks',
    ]);

    // Firefox
    const ffBase = L+'/Firefox/Profiles';
    const ffPaths = [];
    if (fs.existsSync(ffBase))
      fs.readdirSync(ffBase).filter(p=>p.includes('default'))
        .forEach(p => ffPaths.push(ffBase+'/'+p+'/places.sqlite'));
    firefox('firefox', ffPaths);

  } else {
    // Linux
    const C = home+'/.config';
    chromium('chrome',   [C+'/google-chrome/Default/Bookmarks']);
    chromium('edge',     [C+'/microsoft-edge/Default/Bookmarks']);
    chromium('brave',    [C+'/BraveSoftware/Brave-Browser/Default/Bookmarks']);
    chromium('opera',    [C+'/opera/Bookmarks']);
    chromium('vivaldi',  [C+'/vivaldi/Default/Bookmarks']);
    // Zen on Linux
    chromium('zen',      [C+'/zen/Default/Bookmarks',
                          home+'/.zen/Default/Bookmarks']);
    defs['arc'] = { paths: [], type: 'chromium' }; // Arc Linux not available

    const ffBase = home+'/.mozilla/firefox';
    const ffPaths = [];
    if (fs.existsSync(ffBase))
      fs.readdirSync(ffBase).filter(p=>p.includes('default'))
        .forEach(p => ffPaths.push(ffBase+'/'+p+'/places.sqlite'));
    firefox('firefox', ffPaths);
  }

  return defs;
}

// Resolve which path actually exists for each browser
function scanBrowserPaths() {
  const defs = getBrowserDefs();
  const result = {};
  for (const [browser, def] of Object.entries(defs)) {
    const found = def.paths.find(p => fs.existsSync(p));
    result[browser] = {
      path:   found || def.paths[0] || '',
      exists: !!found,
      type:   def.type,
    };
  }
  return result;
}

// ─── PARSERS ─────────────────────────────────────────────────────────────────

// Parse Chromium JSON → returns array of bookmark objects WITH native_id
function parseChromium(filePath, browser) {
  const out = [];
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const roots = data.roots || {};
    function walk(node, folder) {
      if (!node) return;
      if (node.type === 'url') {
        const url = node.url || '';
        if (!url || url.startsWith('javascript:') || url.startsWith('chrome:') || url.startsWith('edge:')) return;
        out.push({
          title:      node.name || url,
          url,
          folder_path: folder,
          browser,
          date_added: node.date_added ? Math.floor(parseInt(node.date_added)/1000000 - 11644473600) : Math.floor(Date.now()/1000),
          url_hash:   hash(url),
          native_id:  node.id || '',        // Chromium's internal numeric id
          _guid:      node.guid || '',      // For write-back lookup
        });
      } else if (node.children) {
        const p = folder ? folder+' / '+(node.name||'') : (node.name||'');
        (node.children || []).forEach(c => walk(c, p));
      }
    }
    ['bookmark_bar','other','synced','mobile'].forEach(k => roots[k] && walk(roots[k], ''));
  } catch(e) { console.error('parseChromium:', e.message); }
  return out;
}

// Parse Firefox SQLite — returns bookmarks with url_hash and guid stored as native_id
async function parseFirefox(ffPath, browser='firefox') {
  const out = [];
  try {
    const tmp = path.join(os.tmpdir(), 'ff_tmp_'+Date.now()+'.sqlite');
    fs.copyFileSync(ffPath, tmp);
    const ffDb = new SQL.Database(fs.readFileSync(tmp));
    const rows = qAllFrom(ffDb, `
      SELECT b.id, b.guid, b.title, p.url, b.dateAdded, f.title as folder_name
      FROM moz_bookmarks b
      JOIN moz_places p ON b.fk = p.id
      LEFT JOIN moz_bookmarks f ON f.id = b.parent AND f.type = 2
      WHERE b.type = 1 AND p.url NOT LIKE 'javascript:%' AND p.url NOT LIKE 'place:%'
      LIMIT 200000
    `, []);
    rows.forEach(r => out.push({
      title:       r.title || r.url,
      url:         r.url,
      folder_path: r.folder_name || '',
      browser,
      date_added:  r.dateAdded ? Math.floor(r.dateAdded/1000000) : Math.floor(Date.now()/1000),
      url_hash:    hash(r.url),
      // Store guid as native_id — used to detect deletions via moz_bookmarks_deleted
      native_id:   r.guid || String(r.id || ''),
      _guid:       r.guid || '',
      _ffPath:     ffPath,
    }));
    ffDb.close();
    try { fs.unlinkSync(tmp); } catch(_) {}
  } catch(e) { console.error('parseFirefox:', e.message); }
  return out;
}

// Read moz_bookmarks_deleted from a Firefox/Zen places.sqlite
// Returns Set of guids that have been deleted from the browser
function getFirefoxDeletedGuids(ffPath) {
  const guids = new Set();
  try {
    const tmp = path.join(os.tmpdir(), 'ff_del_'+Date.now()+'.sqlite');
    fs.copyFileSync(ffPath, tmp);
    const ffDb = new SQL.Database(fs.readFileSync(tmp));
    // moz_bookmarks_deleted has: guid TEXT, dateRemoved INTEGER
    const rows = qAllFrom(ffDb, 'SELECT guid FROM moz_bookmarks_deleted', []);
    rows.forEach(r => { if (r.guid) guids.add(r.guid); });
    ffDb.close();
    try { fs.unlinkSync(tmp); } catch(_) {}
  } catch(e) {
    console.error('getFirefoxDeletedGuids:', e.message);
  }
  return guids;
}

// Parse Netscape HTML
function parseHtml(html, browser) {
  const out=[]; const stack=[]; let folder='';
  for (const line of html.split('\n')) {
    const h3 = /<H3[^>]*>([^<]*)<\/H3>/i.exec(line);
    if (h3) { folder=h3[1].trim(); stack.push(folder); }
    if (/<\/DL>/i.test(line) && stack.length) { stack.pop(); folder=stack[stack.length-1]||''; }
    const a = /<A\s[^>]*HREF="([^"]*)"[^>]*ADD_DATE="?(\d+)"?[^>]*>([^<]*)<\/A>/i.exec(line)
           || /<A\s[^>]*HREF="([^"]*)"[^>]*>([^<]*)<\/A>/i.exec(line);
    if (a) {
      const url=a[1];
      if (!url||url.startsWith('javascript:')||url.startsWith('place:')) continue;
      out.push({ title:(a[3]||a[2]||url).trim(), url, folder_path:folder, browser,
        date_added: a[2]?parseInt(a[2]):Math.floor(Date.now()/1000), url_hash:hash(url), native_id:'' });
    }
  }
  return out;
}

function hash(str) {
  let h=0; for (let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0;} return h.toString(16);
}

// ─── WRITE-BACK: Delete from browser file ─────────────────────────────────────
const crypto = require('crypto');

// Chrome stores an MD5 checksum of its roots in the bookmark file.
// If the checksum is wrong, Chrome silently restores from Bookmarks.bak.
// We must recompute it after modifying the file.
function computeChromiumChecksum(roots) {
  try {
    return crypto.createHash('md5').update(JSON.stringify(roots)).digest('hex');
  } catch(e) { return ''; }
}

function deleteFromChromiumFile(filePath, urlsToDelete) {
  console.log(`[write-back] deleteFromChromiumFile called`);
  console.log(`[write-back]   file : ${filePath}`);
  console.log(`[write-back]   urls : ${JSON.stringify(urlsToDelete)}`);

  if (!fs.existsSync(filePath)) {
    console.warn(`[write-back] File not found: ${filePath}`);
    return { removed: 0, error: 'file not found' };
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch(parseErr) {
    console.error(`[write-back] JSON parse failed: ${parseErr.message}`);
    return { removed: 0, error: 'json parse failed' };
  }

  const urlSet = new Set(urlsToDelete);
  let removed = 0;

  function prune(node) {
    if (!node) return null;
    if (node.type === 'url') {
      if (urlSet.has(node.url)) { removed++; return null; }
      return node;
    }
    if (Array.isArray(node.children)) {
      node.children = node.children.map(prune).filter(Boolean);
    }
    return node;
  }

  const roots = data.roots || {};
  ['bookmark_bar', 'other', 'synced', 'mobile'].forEach(k => {
    if (roots[k]) roots[k] = prune(roots[k]);
  });

  if (removed === 0) {
    // Diagnostic: sample what URLs the file actually contains
    const sampleUrls = [];
    function collectSample(node) {
      if (!node || sampleUrls.length >= 5) return;
      if (node.type === 'url') { sampleUrls.push(node.url); return; }
      (node.children || []).forEach(collectSample);
    }
    Object.values(roots).forEach(collectSample);
    console.warn(`[write-back] 0 URLs matched. Tried: ${JSON.stringify(urlsToDelete.slice(0,2))}`);
    console.warn(`[write-back] File sample URLs: ${JSON.stringify(sampleUrls)}`);
    return { removed: 0 };
  }

  // Recompute checksum — without this Chrome rolls back to Bookmarks.bak
  data.checksum = computeChromiumChecksum(roots);

  const json = JSON.stringify(data, null, 3);
  const tmp = filePath + '.nexus_wb_tmp';

  try {
    fs.writeFileSync(tmp, json, 'utf8');
    try {
      fs.renameSync(tmp, filePath);
    } catch(renameErr) {
      console.warn(`[write-back] rename failed (${renameErr.code}), using direct write`);
      fs.writeFileSync(filePath, json, 'utf8');
      try { fs.unlinkSync(tmp); } catch(_) {}
    }
    console.log(`[write-back] SUCCESS: removed ${removed}/${urlSet.size} URLs from ${filePath}`);
    return { removed };
  } catch(writeErr) {
    console.error(`[write-back] Write failed: ${writeErr.message}`);
    try { fs.unlinkSync(tmp); } catch(_) {}
    return { removed: 0, error: writeErr.message };
  }
}

// For Firefox SQLite: delete by URL, write back the modified DB
function deleteFromFirefoxFile(ffPath, urlsToDelete) {
  console.log(`[write-back] deleteFromFirefoxFile called`);
  console.log(`[write-back]   file : ${ffPath}`);
  console.log(`[write-back]   urls : ${JSON.stringify(urlsToDelete)}`);

  if (!fs.existsSync(ffPath)) {
    console.warn(`[write-back] Firefox file not found: ${ffPath}`);
    return { removed: 0, error: 'file not found' };
  }

  const tmp = ffPath + '.nexus_tmp';
  try {
    fs.copyFileSync(ffPath, tmp);
    const ffDb = new SQL.Database(fs.readFileSync(tmp));
    const urlSet = new Set(urlsToDelete);
    let removed = 0;

    for (const url of urlSet) {
      try {
        const place = qAllFrom(ffDb, 'SELECT id FROM moz_places WHERE url=?', [url]);
        if (place.length) {
          const pid = place[0].id;
          ffDb.run('DELETE FROM moz_bookmarks WHERE fk=? AND type=1', [pid]);
          const changes = qAllFrom(ffDb, 'SELECT changes() as c')[0]?.c || 0;
          console.log(`[write-back]   ${url} → place_id=${pid}, deleted=${changes}`);
          removed += changes;
        } else {
          console.warn(`[write-back]   URL not found in moz_places: ${url}`);
        }
      } catch(rowErr) {
        console.error(`[write-back]   Row error for ${url}:`, rowErr.message);
      }
    }

    const exportData = Buffer.from(ffDb.export());
    ffDb.close();
    fs.writeFileSync(tmp, exportData);
    try {
      fs.renameSync(tmp, ffPath);
    } catch(renameErr) {
      console.warn(`[write-back] FF rename failed (${renameErr.code}), using direct write`);
      fs.writeFileSync(ffPath, exportData);
      try { fs.unlinkSync(tmp); } catch(_) {}
    }
    console.log(`[write-back] Firefox SUCCESS: removed ${removed}/${urlSet.size} from ${ffPath}`);
    return { removed };
  } catch(e) {
    console.error('[write-back] deleteFromFirefoxFile error:', e.message, e.stack);
    try { fs.unlinkSync(tmp); } catch(_) {}
    return { removed: 0, error: e.message };
  }
}

// ─── LIVE SYNC: Watch browser files for changes ───────────────────────────────
const watchers = {};          // path → FSWatcher
const syncDebounce = {};      // path → timeout handle
let isSyncingCounter = 0;     // >0 means we wrote the file, skip incoming events

function startLiveSync() {
  const browsers = scanBrowserPaths();

  for (const [browser, info] of Object.entries(browsers)) {
    if (!info.exists || !info.path) continue;
    watchBrowserFile(info.path, browser, info.type);
  }

  console.log('Live sync started for:', Object.keys(browsers).filter(b => browsers[b].exists).join(', '));
}

function watchBrowserFile(filePath, browser, type) {
  if (watchers[filePath]) return; // already watching
  if (!fs.existsSync(filePath)) return;

  try {
    // For Firefox/Zen: SQLite uses WAL (Write-Ahead Logging) mode.
    // Changes are written to places.sqlite-wal FIRST; the main places.sqlite
    // file may not be touched until a checkpoint occurs (which can be delayed).
    // Watching only places.sqlite means we miss deletions entirely.
    // Fix: for firefox-type browsers, watch the PARENT DIRECTORY — this catches
    // writes to -wal, -shm, and the main file.
    const watchTarget = type === 'firefox' ? path.dirname(filePath) : filePath;
    const isDir = type === 'firefox';

    const watcher = fs.watch(watchTarget, { persistent: false, recursive: false }, (eventType, filename) => {
      if (isSyncingCounter > 0) return; // we caused this change — skip
      // For directory watches, only react to changes involving our sqlite files
      if (isDir && filename) {
        const base = path.basename(filePath);
        const relevant = filename === base ||
                         filename === base + '-wal' ||
                         filename === base + '-shm';
        if (!relevant) return;
      }
      clearTimeout(syncDebounce[filePath]);
      syncDebounce[filePath] = setTimeout(() => {
        handleBrowserFileChange(filePath, browser, type);
      }, 3000); // debounce — browser may still be writing
    });
    watchers[filePath] = watcher;
    watcher.on('error', () => { delete watchers[filePath]; });
    console.log(`Watching (${isDir ? 'dir' : 'file'}):`, watchTarget, '→', browser);
  } catch(e) {
    console.error('watch failed:', filePath, e.message);
  }
}

async function handleBrowserFileChange(filePath, browser, type) {
  if (!fs.existsSync(filePath)) return;
  console.log('[sync] Browser file changed:', browser, filePath);

  try {
    // ── Step 1: detect deletions ──────────────────────────────────────────────
    // For Firefox/Zen: use moz_bookmarks_deleted table (most reliable)
    // It records guid of every bookmark the user deletes from the browser.
    // We match against native_id column (which stores the guid since we fixed parseFirefox).
    if (type === 'firefox') {
      const deletedGuids = getFirefoxDeletedGuids(filePath);
      if (deletedGuids.size > 0) {
        // Find ALL rows for this browser (active OR soft-deleted) whose native_id is in deletedGuids
        const allRows = qAll(
          'SELECT id, native_id, url_hash FROM bookmarks WHERE browser=?',
          [browser]
        );
        const toHardDelete = allRows.filter(r => r.native_id && deletedGuids.has(r.native_id));
        if (toHardDelete.length > 0) {
          db.run('BEGIN');
          toHardDelete.forEach(r => db.run('DELETE FROM bookmarks WHERE id=?', [r.id]));
          db.run('COMMIT');
          save();
          console.log(`[sync] ${browser}: ${toHardDelete.length} deleted via moz_bookmarks_deleted → removed from DB`);
        }
      }
    }

    // ── Step 2: parse fresh bookmarks from browser file ───────────────────────
    let freshBms = [];
    if (type === 'firefox') {
      freshBms = await parseFirefox(filePath, browser);
    } else {
      freshBms = parseChromium(filePath, browser);
    }

    // If parse returned 0 results, browser may be mid-write — skip deletion-by-diff
    // to avoid false positives, but still process any new bookmarks if we got results
    if (freshBms.length === 0) {
      console.log(`[sync] ${browser}: parse returned 0 — skipping diff (browser may be writing)`);
      return;
    }

    const freshHashes = new Set(freshBms.map(b => b.url_hash || hash(b.url || '')));

    // ── Step 3: diff-based deletion (catches ALL rows including soft-deleted) ──
    // Any bookmark in our DB (active OR soft-deleted) that no longer exists in the
    // browser file should be hard-deleted from our DB entirely.
    const allInDB = qAll('SELECT id, url_hash FROM bookmarks WHERE browser=?', [browser]);
    const removedFromBrowser = allInDB.filter(r => r.url_hash && !freshHashes.has(r.url_hash));
    if (removedFromBrowser.length > 0) {
      db.run('BEGIN');
      removedFromBrowser.forEach(r => db.run('DELETE FROM bookmarks WHERE id=?', [r.id]));
      db.run('COMMIT');
      save();
      console.log(`[sync] ${browser}: ${removedFromBrowser.length} bookmarks no longer in browser → removed from DB`);
    }

    // ── Step 4: insert new bookmarks ─────────────────────────────────────────
    // Only skip URLs that are ACTIVE in DB (soft-deleted rows were just purged above,
    // so they won't block re-insertion if user re-added the bookmark in browser)
    const activeHashes = new Set(
      qAll('SELECT url_hash FROM bookmarks WHERE browser=?', [browser]).map(r => r.url_hash)
    );
    const newBms = freshBms.filter(b => {
      const h = b.url_hash || hash(b.url || '');
      return !activeHashes.has(h);
    });
    const added = newBms.length > 0 ? insertBookmarks(newBms) : 0;
    if (added > 0) console.log(`[sync] ${browser}: +${added} new bookmarks inserted`);

    if (added === 0 && removedFromBrowser.length === 0) return;

    // Notify renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('bookmarks-synced', {
        browser, added,
        deleted: removedFromBrowser.length,
        total: freshBms.length,
      });
    }
  } catch(e) {
    console.error('[sync] handleBrowserFileChange error:', e.message, e.stack);
  }
}

function stopLiveSync() {
  for (const watcher of Object.values(watchers)) {
    try { watcher.close(); } catch(_) {}
  }
  Object.keys(watchers).forEach(k => delete watchers[k]);
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────
function insertBookmarks(bms) {
  if (useMem) {
    const added = bms.filter(b => !mem.bookmarks.find(x => x.url_hash===b.url_hash && x.browser===b.browser))
                     .map(b => ({...b, id:mem.nextId++, tags:b.tags||'[]'}));
    mem.bookmarks.push(...added); return added.length;
  }
  const now = Math.floor(Date.now()/1000);
  let total = 0;
  let skipped = 0;
  const CHUNK = 500;
  for (let i=0; i<bms.length; i+=CHUNK) {
    const chunk = bms.slice(i, i+CHUNK);
    db.run('BEGIN');
    for (const b of chunk) {
      try {
        // Ensure url_hash is never empty — empty string defeats the unique index
        const urlHash = b.url_hash || hash(b.url || '');
        // Skip if this exact (url_hash, browser) was soft-deleted by the user
        // Use INSERT OR IGNORE — the unique index prevents re-insertion if row exists (active or deleted)
        // But we also must not re-insert if the row is soft-deleted (is_deleted=1)
        db.run(
          `INSERT OR IGNORE INTO bookmarks
            (title,url,folder_path,browser,tags,date_added,url_hash,native_id,created_at,is_deleted,deleted_at)
           VALUES(?,?,?,?,?,?,?,?,?,0,0)`,
          [b.title||'', b.url||'', b.folder_path||'', b.browser||'unknown', b.tags||'[]',
           b.date_added||now, urlHash, b.native_id||'', now]
        );
        // db.getRowsModified() is the correct sql.js API (not SELECT changes() inside tx)
        const changed = db.getRowsModified();
        total   += changed;
        skipped += (changed === 0 ? 1 : 0);
      } catch(e) { console.error('[insert] row error:', e.message, b.url); }
    }
    db.run('COMMIT');
  }
  console.log(`[insert] ${total} inserted, ${skipped} skipped (already exist)`);
  save(); return total;
}

function queryBookmarks({search,browser,folder,filter,sortKey,sortDir,limit,offset,tag}) {
  limit=Math.min(limit||500,100000); offset=offset||0;
  if (useMem) return queryMem({search,browser,folder,filter,sortKey,sortDir,limit,offset,tag});
  const cond=[]; const p=[];

  // Deleted section shows ONLY deleted; everything else hides deleted
  if (filter==='deleted') {
    cond.push('is_deleted=1');
  } else {
    cond.push('(is_deleted IS NULL OR is_deleted=0)');
  }

  if (browser&&browser!=='all') { cond.push('browser=?'); p.push(browser); }
  if (folder) { cond.push('folder_path LIKE ?'); p.push('%'+folder+'%'); }
  if (filter==='recent') { cond.push('date_added>?'); p.push(Math.floor(Date.now()/1000)-30*86400); }
  else if (filter==='liked') cond.push('is_liked=1');
  else if (filter==='dead') cond.push('is_dead=1');
  else if (filter==='duplicates') cond.push('url_hash IN (SELECT url_hash FROM bookmarks WHERE (is_deleted IS NULL OR is_deleted=0) GROUP BY url_hash HAVING COUNT(*)>1)');
  else if (filter==='untagged') cond.push("(tags='[]' OR tags IS NULL OR tags='')");

  // Tag filter: sidebar tag chip click
  if (tag) { cond.push("tags LIKE ?"); p.push('%'+tag+'%'); }

  // Search: titles, URLs, folders AND tags
  if (search?.trim()) {
    const q='%'+search.trim()+'%';
    cond.push('(title LIKE ? OR url LIKE ? OR folder_path LIKE ? OR tags LIKE ?)');
    p.push(q,q,q,q);
  }

  const W=cond.length?'WHERE '+cond.join(' AND '):'';
  const C=['title','url','date_added','browser','folder_path'].includes(sortKey)?sortKey:'date_added';
  const D=sortDir==='asc'?'ASC':'DESC';
  const total=qGet(`SELECT COUNT(*) as total FROM bookmarks ${W}`,p)?.total||0;
  const rows=qAll(`SELECT * FROM bookmarks ${W} ORDER BY ${C} ${D} LIMIT ? OFFSET ?`,[...p,limit,offset]);
  return {rows, total};
}

function queryMem({search,browser,folder,filter,sortKey,sortDir,limit,offset,tag}) {
  let bms = filter==='deleted'
    ? mem.bookmarks.filter(b=>b.is_deleted)
    : mem.bookmarks.filter(b=>!b.is_deleted);
  if (search){const q=search.toLowerCase();bms=bms.filter(b=>(b.title||'').toLowerCase().includes(q)||(b.url||'').toLowerCase().includes(q)||(b.folder_path||'').toLowerCase().includes(q)||(b.tags||'').toLowerCase().includes(q));}
  if (tag) bms=bms.filter(b=>(b.tags||'').includes(tag));
  if (browser&&browser!=='all') bms=bms.filter(b=>b.browser===browser);
  if (folder) bms=bms.filter(b=>(b.folder_path||'').includes(folder));
  if (filter==='recent'){const c=Math.floor(Date.now()/1000)-30*86400;bms=bms.filter(b=>b.date_added>c);}
  else if (filter==='liked') bms=bms.filter(b=>b.is_liked===1||b.is_liked==='1');
  else if (filter==='duplicates'){const h={};mem.bookmarks.filter(b=>!b.is_deleted).forEach(b=>{h[b.url_hash]=(h[b.url_hash]||0)+1});bms=bms.filter(b=>h[b.url_hash]>1);}
  else if (filter==='untagged') bms=bms.filter(b=>!b.tags||b.tags==='[]');
  const dir=sortDir==='asc'?1:-1; const col=sortKey||'date_added';
  bms.sort((a,b)=>{const av=a[col]||'',bv=b[col]||'';return av<bv?-dir:av>bv?dir:0});
  return {rows:bms.slice(offset,offset+limit), total:bms.length};
}

function getStats() {
  if (useMem) {
    const bms=mem.bookmarks; const hm={};bms.forEach(b=>{hm[b.url_hash]=(hm[b.url_hash]||0)+1});
    const dupes=bms.filter(b=>hm[b.url_hash]>1).length;
    const browsers={};bms.forEach(b=>{browsers[b.browser]=(browsers[b.browser]||0)+1});
    const folders={};bms.forEach(b=>{if(b.folder_path)folders[b.folder_path]=(folders[b.folder_path]||0)+1});
    const domains={};bms.forEach(b=>{try{const d=new URL(b.url).hostname.replace('www.','');domains[d]=(domains[d]||0)+1}catch(_){}});
    return {
      total:activeBms.length, deleted:bms.filter(b=>b.is_deleted&&(b.browser==='user'||b.user_added)).length, dupes, recent:activeBms.filter(b=>b.date_added>Math.floor(Date.now()/1000)-30*86400).length,
      untagged:bms.filter(b=>!b.tags||b.tags==='[]').length,
      browsers:Object.entries(browsers).map(([browser,count])=>({browser,count})),
      topFolders:Object.entries(folders).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([name,count])=>({name,count})),
      topDomains:Object.entries(domains).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([domain,count])=>({domain,count})),
    };
  }
  const ACTIVE = "(is_deleted IS NULL OR is_deleted=0)";
  const total    =qGet(`SELECT COUNT(*) as c FROM bookmarks WHERE ${ACTIVE}`)?.c||0;
  // deleted count = only user_added=1 rows in deleted section (purgeable count shown in sidebar)
  const deleted  =qGet(`SELECT COUNT(*) as c FROM bookmarks WHERE is_deleted=1 AND (browser='user' OR user_added=1)`)?.c||0;
  const dupes    =qGet(`SELECT COUNT(*) as c FROM bookmarks WHERE ${ACTIVE} AND url_hash IN (SELECT url_hash FROM bookmarks WHERE ${ACTIVE} GROUP BY url_hash HAVING COUNT(*)>1)`)?.c||0;
  const recent   =qGet(`SELECT COUNT(*) as c FROM bookmarks WHERE ${ACTIVE} AND date_added>?`,[Math.floor(Date.now()/1000)-30*86400])?.c||0;
  const untagged =qGet(`SELECT COUNT(*) as c FROM bookmarks WHERE ${ACTIVE} AND (tags='[]' OR tags IS NULL OR tags='')`)?.c||0;
  const dead     =qGet(`SELECT COUNT(*) as c FROM bookmarks WHERE ${ACTIVE} AND is_dead=1`)?.c||0;
  const liked    =qGet(`SELECT COUNT(*) as c FROM bookmarks WHERE ${ACTIVE} AND is_liked=1`)?.c||0;
  const browsers =qAll(`SELECT browser,COUNT(*) as count FROM bookmarks WHERE ${ACTIVE} GROUP BY browser ORDER BY count DESC`);
  const topFolders=qAll(`SELECT folder_path as name,COUNT(*) as count FROM bookmarks WHERE ${ACTIVE} AND folder_path!='' GROUP BY folder_path ORDER BY count DESC LIMIT 20`);
  const domains={};qAll(`SELECT url FROM bookmarks WHERE ${ACTIVE} LIMIT 50000`).forEach(r=>{try{const d=new URL(r.url).hostname.replace('www.','');domains[d]=(domains[d]||0)+1}catch(_){}});
  const topDomains=Object.entries(domains).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([domain,count])=>({domain,count}));
  return {total,deleted,dupes,recent,untagged,dead,liked,browsers,topFolders,topDomains};
}

// ─── IPC HANDLERS ─────────────────────────────────────────────────────────────

ipcMain.handle('scan-browsers', async () => {
  const info = scanBrowserPaths();
  const result = {};
  for (const [browser, d] of Object.entries(info)) {
    result[browser] = { path: d.path, exists: d.exists, type: d.type };
  }
  return result;
});

ipcMain.handle('import-browser', async (_, {browser, filePath}) => {
  if (!fs.existsSync(filePath)) return {success:false, error:'File not found: '+filePath, count:0};
  try {
    const info = scanBrowserPaths();
    const type = info[browser]?.type || 'chromium';
    const bms = type==='firefox' ? await parseFirefox(filePath, browser) : parseChromium(filePath, browser);
    const count = insertBookmarks(bms);
    // Start watching this file if not already
    watchBrowserFile(filePath, browser, type);
    return {success:true, count, total:bms.length};
  } catch(e) { return {success:false, error:e.message, count:0}; }
});

ipcMain.handle('import-html-file', async (_, {filePath, browser}) => {
  try {
    const bms = parseHtml(fs.readFileSync(filePath,'utf8'), browser||'other');
    const count = insertBookmarks(bms);
    return {success:true, count, total:bms.length};
  } catch(e) { return {success:false, error:e.message, count:0}; }
});

ipcMain.handle('open-file-dialog', async (_, {filters}) => {
  return dialog.showOpenDialog({
    properties:['openFile','multiSelections'],
    filters:filters||[{name:'Bookmark Files',extensions:['html','htm','json','sqlite']}],
  });
});

ipcMain.handle('query-bookmarks', async (_, params) => queryBookmarks(params));
ipcMain.handle('get-stats',       async ()        => getStats());

// ── DELETE with write-back to browser ────────────────────────────────────────
ipcMain.handle('delete-bookmarks', async (_, {ids, writeBack=true}) => {
  console.log(`[delete] Received delete request: ${ids.length} ids, writeBack=${writeBack}`);

  // Normalise ids to numbers (IPC can deliver strings on some platforms)
  const numIds = ids.map(Number);

  // 1. Fetch full records so we have URLs and browser names for write-back
  let toDelete = [];
  if (useMem) {
    toDelete = mem.bookmarks.filter(b => numIds.includes(Number(b.id)));
  } else {
    toDelete = qAll(
      `SELECT id, url, browser, native_id FROM bookmarks WHERE id IN (${numIds.map(()=>'?').join(',')})`,
      numIds
    );
  }

  console.log(`[delete] Found ${toDelete.length} records to delete from DB`);
  if (toDelete.length === 0) {
    console.warn('[delete] No records found for the given ids — nothing to delete');
  }

  // 2. Write-back: remove from browser files
  if (writeBack && toDelete.length > 0) {
    // Group URLs by browser
    const byBrowser = {};
    toDelete.forEach(b => {
      const key = (b.browser || '').toLowerCase();
      if (!byBrowser[key]) byBrowser[key] = [];
      byBrowser[key].push(b.url);
    });

    console.log('[delete] Write-back groups:', Object.fromEntries(
      Object.entries(byBrowser).map(([k,v]) => [k, v.length + ' URLs'])
    ));

    const browserPaths = scanBrowserPaths();
    console.log('[delete] Detected browser paths:', JSON.stringify(
      Object.fromEntries(Object.entries(browserPaths).map(([k,v]) => [k, { exists: v.exists, path: v.path }]))
    ));

    // Suppress live-sync re-import while we write
    isSyncingCounter++;
    Object.keys(syncDebounce).forEach(k => clearTimeout(syncDebounce[k]));

    for (const [browser, urls] of Object.entries(byBrowser)) {
      const info = browserPaths[browser];

      if (!info) {
        console.warn(`[delete] Browser "${browser}" not in detected paths — skipping write-back`);
        continue;
      }
      if (!info.exists) {
        console.warn(`[delete] Browser "${browser}" path does not exist: ${info.path} — skipping write-back`);
        continue;
      }

      console.log(`[delete] Writing back to ${browser} (${info.type}): ${info.path}`);
      try {
        let result;
        if (info.type === 'firefox') {
          result = deleteFromFirefoxFile(info.path, urls);
        } else {
          result = deleteFromChromiumFile(info.path, urls);
        }
        console.log(`[delete] Write-back result for ${browser}:`, result);
      } catch(e) {
        console.error(`[delete] Write-back threw for ${browser}:`, e.message, e.stack);
      }
    }

    // Re-enable live sync after file-watch events have settled
    setTimeout(() => {
      isSyncingCounter = Math.max(0, isSyncingCounter - 1);
      console.log('[delete] Write-back suppression lifted');
    }, 5000);
  }

  // 3. Soft-delete: set is_deleted=1, deleted_at=now (do NOT hard-delete)
  const delNow = Math.floor(Date.now()/1000);
  if (useMem) {
    numIds.forEach(id => {
      const b = mem.bookmarks.find(x => Number(x.id) === id);
      if (b) { b.is_deleted = 1; b.deleted_at = delNow; }
    });
    console.log(`[delete] In-memory: soft-deleted ${numIds.length} records`);
  } else {
    db.run('BEGIN');
    numIds.forEach(id => db.run('UPDATE bookmarks SET is_deleted=1, deleted_at=? WHERE id=?', [delNow, id]));
    db.run('COMMIT');
    console.log(`[delete] DB: soft-deleted ${numIds.length} records`);
    save();
  }

  return { success: true, count: numIds.length };
});

ipcMain.handle('delete-duplicates', async () => {
  const delNow = Math.floor(Date.now()/1000);
  if (useMem) {
    const seen={};
    mem.bookmarks.filter(b=>!b.is_deleted).forEach(b=>{
      if(seen[b.url_hash]) { b.is_deleted=1; b.deleted_at=delNow; }
      else seen[b.url_hash]=true;
    });
    const count = mem.bookmarks.filter(b=>b.is_deleted&&b.deleted_at===delNow).length;
    return {success:true, count};
  }
  // Find duplicate ids to soft-delete (keep MIN(id) per url_hash, soft-delete rest)
  const toSoftDel = qAll(`
    SELECT id FROM bookmarks
    WHERE (is_deleted IS NULL OR is_deleted=0)
      AND id NOT IN (
        SELECT MIN(id) FROM bookmarks
        WHERE (is_deleted IS NULL OR is_deleted=0)
        GROUP BY url_hash
      )
  `);
  const count = toSoftDel.length;
  if (count > 0) {
    db.run('BEGIN');
    toSoftDel.forEach(r => db.run('UPDATE bookmarks SET is_deleted=1, deleted_at=? WHERE id=?', [delNow, r.id]));
    db.run('COMMIT');
    save();
  }
  return {success:true, count};
});

ipcMain.handle('restore-bookmarks', async (_, {ids}) => {
  const numIds = (ids||[]).map(Number);
  if (useMem) {
    numIds.forEach(id => {
      const b = mem.bookmarks.find(x => Number(x.id) === id);
      if (b) { b.is_deleted = 0; b.deleted_at = 0; }
    });
  } else {
    db.run('BEGIN');
    numIds.forEach(id => db.run('UPDATE bookmarks SET is_deleted=0, deleted_at=0 WHERE id=?', [id]));
    db.run('COMMIT');
    save();
  }
  return { success: true, count: numIds.length };
});

ipcMain.handle('purge-deleted', async () => {
  // Only purge bookmarks that were manually pasted by user (browser='user', user_added=1)
  // Browser-synced bookmarks that land in Deleted are not purged here —
  // they were already removed from the source (browser) by the sync engine.
  if (useMem) {
    const before = mem.bookmarks.length;
    mem.bookmarks = mem.bookmarks.filter(b => !(b.is_deleted && (b.browser === 'user' || b.user_added)));
    return { success: true, count: before - mem.bookmarks.length };
  }
  const count = qGet("SELECT COUNT(*) as c FROM bookmarks WHERE is_deleted=1 AND (browser='user' OR user_added=1)")?.c || 0;
  db.run("DELETE FROM bookmarks WHERE is_deleted=1 AND (browser='user' OR user_added=1)");
  save();
  return { success: true, count };
});

ipcMain.handle('update-bookmark', async (_, {id, data}) => {
  if (useMem) { const idx=mem.bookmarks.findIndex(b=>b.id===id); if(idx>=0) Object.assign(mem.bookmarks[idx],data); return {success:true}; }
  const fields=Object.keys(data).map(k=>`${k}=?`).join(', ');
  qRun(`UPDATE bookmarks SET ${fields} WHERE id=?`,[...Object.values(data),id]);
  save(); return {success:true};
});

ipcMain.handle('add-url', async (_, {url, title}) => {
  if (!url || typeof url !== 'string') return { success: false, error: 'No URL' };
  const cleanUrl = url.trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('ftp://')) {
    return { success: false, error: 'Invalid URL — must start with http:// or https://' };
  }
  const urlHash = hash(cleanUrl);
  // Check if already exists (active)
  const existing = qGet('SELECT id FROM bookmarks WHERE url_hash=? AND browser=? AND (is_deleted IS NULL OR is_deleted=0)', [urlHash, 'user']);
  if (existing) return { success: false, error: 'URL already exists', duplicate: true };
  const now = Math.floor(Date.now() / 1000);
  const bm = {
    title: title || cleanUrl,
    url: cleanUrl,
    folder_path: '',
    browser: 'user',
    date_added: now,
    url_hash: urlHash,
    native_id: '',
    tags: '[]',
    user_added: 1,
  };
  const count = insertBookmarks([bm]);
  // Mark user_added=1 explicitly (insertBookmarks may not pass it)
  if (count > 0) {
    qRun('UPDATE bookmarks SET user_added=1 WHERE url_hash=? AND browser=?', [urlHash, 'user']);
    save();
  }
  return { success: true, count };
});

ipcMain.handle('hard-delete-user', async (_, {ids}) => {
  // Hard-delete (permanent) only allowed for user-pasted bookmarks (browser='user')
  const numIds = (ids || []).map(Number);
  if (!numIds.length) return { success: false, count: 0 };
  if (useMem) {
    const before = mem.bookmarks.length;
    mem.bookmarks = mem.bookmarks.filter(b => {
      const isTarget = numIds.includes(Number(b.id));
      if (!isTarget) return true;
      // Only hard-delete user bookmarks
      return b.browser !== 'user';
    });
    return { success: true, count: before - mem.bookmarks.length };
  }
  // Safety: only hard-delete rows with browser='user'
  const placeholders = numIds.map(() => '?').join(',');
  const count = qGet(`SELECT COUNT(*) as c FROM bookmarks WHERE id IN (${placeholders}) AND browser='user'`, numIds)?.c || 0;
  if (count > 0) {
    db.run(`DELETE FROM bookmarks WHERE id IN (${placeholders}) AND browser='user'`, numIds);
    save();
  }
  return { success: true, count };
});

ipcMain.handle('like-bookmark', async (_, {id, liked}) => {
  if (useMem) {
    const bm = mem.bookmarks.find(b => b.id === id);
    if (bm) bm.is_liked = liked ? 1 : 0;
    return { success: true };
  }
  qRun('UPDATE bookmarks SET is_liked=? WHERE id=?', [liked ? 1 : 0, id]);
  save();
  return { success: true };
});

ipcMain.handle('delete-tag', async (_, {tagName}) => {
  // Remove tagName from every bookmark's tags array
  if (useMem) {
    mem.bookmarks.forEach(bm => {
      try {
        const t = JSON.parse(bm.tags || '[]');
        const idx = t.indexOf(tagName);
        if (idx !== -1) { t.splice(idx, 1); bm.tags = JSON.stringify(t); }
      } catch(_) {}
    });
    return { success: true };
  }
  const rows = qAll("SELECT id, tags FROM bookmarks WHERE tags LIKE ?", ['%' + tagName + '%']);
  db.run('BEGIN');
  for (const row of rows) {
    try {
      const t = JSON.parse(row.tags || '[]');
      const idx = t.indexOf(tagName);
      if (idx !== -1) { t.splice(idx, 1); db.run('UPDATE bookmarks SET tags=? WHERE id=?', [JSON.stringify(t), row.id]); }
    } catch(_) {}
  }
  db.run('COMMIT');
  save();
  return { success: true };
});

ipcMain.handle('add-tag', async (_, {bookmarkIds, tagName}) => {
  if (useMem) {
    bookmarkIds.forEach(id=>{const bm=mem.bookmarks.find(b=>b.id===id);if(bm){const t=JSON.parse(bm.tags||'[]');if(!t.includes(tagName)){t.push(tagName);bm.tags=JSON.stringify(t);}}});
    return {success:true};
  }
  db.run('BEGIN');
  for (const id of bookmarkIds) {
    const bm=qGet('SELECT tags FROM bookmarks WHERE id=?',[id]);
    if(bm){try{const t=JSON.parse(bm.tags||'[]');if(!t.includes(tagName)){t.push(tagName);db.run('UPDATE bookmarks SET tags=? WHERE id=?',[JSON.stringify(t),id]);}}catch(_){}}
  }
  db.run('COMMIT'); save(); return {success:true};
});

ipcMain.handle('get-all-tags', async () => {
  const rows=useMem?mem.bookmarks:qAll("SELECT tags FROM bookmarks WHERE tags!='[]' AND tags IS NOT NULL");
  const t={};
  rows.forEach(r=>{try{JSON.parse(r.tags||'[]').forEach(x=>{t[x]=(t[x]||0)+1});}catch(_){}});
  return Object.entries(t).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}));
});

ipcMain.handle('export-bookmarks', async (_, {ids}) => {
  const bms=useMem
    ?(ids?mem.bookmarks.filter(b=>ids.includes(b.id)):[...mem.bookmarks])
    :(ids?qAll(`SELECT * FROM bookmarks WHERE id IN (${ids.map(()=>'?').join(',')})`,ids):qAll('SELECT * FROM bookmarks ORDER BY folder_path,title'));
  const folders={};
  bms.forEach(b=>{const f=b.folder_path||'Unsorted';if(!folders[f])folders[f]=[];folders[f].push(b);});
  let html=`<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n`;
  Object.entries(folders).forEach(([f,items])=>{
    html+=`    <DT><H3>${esc(f)}</H3>\n    <DL><p>\n`;
    items.forEach(b=>{html+=`        <DT><A HREF="${esc(b.url)}" ADD_DATE="${b.date_added||0}">${esc(b.title||'')}</A>\n`;});
    html+=`    </DL><p>\n`;
  });
  html+=`</DL>`;
  const result=await dialog.showSaveDialog({defaultPath:`bookmarks-export-${Date.now()}.html`,filters:[{name:'HTML',extensions:['html']}]});
  if(!result.canceled&&result.filePath){fs.writeFileSync(result.filePath,html,'utf8');return {success:true,count:bms.length};}
  return {success:false};
});

ipcMain.handle('open-url', async (_, url) => shell.openExternal(url));
ipcMain.handle('check-dead-links', async () => ({dead:[],alive:[]}));

ipcMain.handle('get-sync-status', async () => {
  const watching = Object.keys(watchers);
  return { watching, count: watching.length };
});

async function doSync() {
  const browsers = scanBrowserPaths();
  const detected = Object.entries(browsers).filter(([,v]) => v.exists).map(([k]) => k);
  console.log(`[sync] Detected browsers: ${detected.join(', ') || 'none'}`);
  let totalAdded = 0;
  for (const [browser, info] of Object.entries(browsers)) {
    if (!info.exists) {
      console.log(`[sync] ${browser}: not installed / path not found`);
      continue;
    }
    console.log(`[sync] ${browser}: parsing ${info.path} (type=${info.type})`);
    try {
      const bms = info.type === 'firefox'
        ? await parseFirefox(info.path, browser)
        : parseChromium(info.path, browser);
      console.log(`[sync] ${browser}: parsed ${bms.length} bookmarks from file`);
      const added = insertBookmarks(bms);
      totalAdded += added;
      console.log(`[sync] ${browser}: +${added} new inserted (${bms.length - added} already existed)`);
      watchBrowserFile(info.path, browser, info.type);
    } catch(e) {
      console.error(`[sync] ${browser} error:`, e.message, e.stack);
    }
  }
  console.log(`[sync] Total new bookmarks this run: ${totalAdded}`);
  return totalAdded;
}

ipcMain.handle('force-sync', async () => {
  const added = await doSync();
  return { success: true, added };
});

ipcMain.handle('generate-demo-data', async (_, {count}) => {
  const n=count||10000;
  const folders=['Development','Design','AI & ML','News','Shopping','Finance','Entertainment','Travel','Health','Tools','Work','Personal','Research','Tutorials','Videos','Photography','Music','Gaming','Science','Politics'];
  const browsers=['chrome','firefox','edge','brave','opera','zen','arc'];
  const domains=['github.com','stackoverflow.com','developer.mozilla.org','css-tricks.com','medium.com','dev.to','npmjs.com','reactjs.org','tailwindcss.com','figma.com','dribbble.com','producthunt.com','news.ycombinator.com','reddit.com','youtube.com','notion.so','vercel.com','netlify.com','openai.com','huggingface.co','arxiv.org','kaggle.com','coursera.org','udemy.com','wikipedia.org','stripe.com','shopify.com','airtable.com','linear.app','codepen.io'];
  const titles=['Getting Started','Documentation','Tutorial','Reference','Cheatsheet','Examples','API Docs','Release Notes','Blog Post','Case Study','Deep Dive','Guide','Comparison','Review','Introduction','Advanced Guide'];
  const now=Math.floor(Date.now()/1000);
  const bms=Array.from({length:n},(_,i)=>{
    const domain=domains[i%domains.length]; const slug=Math.random().toString(36).slice(2,8);
    return {title:`${titles[i%titles.length]} — ${domain.split('.')[0]} ${slug}`,
      url:`https://${domain}/${folders[i%folders.length].toLowerCase().replace(/ /g,'-')}/${slug}`,
      folder_path:folders[i%folders.length], browser:browsers[i%browsers.length],
      date_added:now-Math.floor(Math.random()*365*86400), url_hash:hash(`${domain}/${slug}/${i}`), tags:'[]'};
  });
  return {success:true, count:insertBookmarks(bms)};
});

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ─── Window ───────────────────────────────────────────────────────────────────
let mainWindow;
let tray = null;

function getIconPath() {
  // Icon search order: assets folder, then inline fallback
  const candidates = [
    path.join(__dirname, '../../assets/icon.png'),
    path.join(__dirname, '../../assets/icon.ico'),
    path.join(__dirname, '../assets/icon.png'),
    path.join(app.getAppPath(), 'assets/icon.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function createTray() {
  const iconPath = getIconPath();
  let trayIcon;
  if (iconPath) {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (process.platform !== 'darwin') {
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
    }
  } else {
    // 16x16 minimal bookmark icon as base64 PNG fallback
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAAa0lEQVQ4y2NgGAWDCvz/TwADBoIYAwMDAwMBmAGFGBgYGBiI0UBMAwMDA4MhGIagANiAgYGBgYGAARgGBgYGBgJmYGBgYGAgYAYGBgYGBgJmYGBgYCBgBgYGBgYCZmBgYGAgYAYGBgYGAmZgYGBgIGAGBgYGBgJmYGBgYCBgBgYGBgJmYGBgYCBgBgAAAABJRU5ErkJggg==';
    trayIcon = nativeImage.createFromDataURL('data:image/png;base64,' + b64);
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Bookmark Nexus');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Bookmark Nexus', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);

  // Left-click on tray icon → show/focus window
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) { mainWindow.focus(); }
      else { mainWindow.show(); }
    }
  });
}

function createWindow() {
  const iconPath = getIconPath();
  mainWindow = new BrowserWindow({
    width:1400, height:900, minWidth:900, minHeight:600,
    titleBarStyle: process.platform==='darwin'?'hiddenInset':'default',
    icon: iconPath || undefined,
    autoHideMenuBar: true,
    menuBarVisible: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname,'preload.js'),
    },
    backgroundColor:'#0d0e14', show:false,
  });

  // Close button → minimize to tray instead of quitting
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      // Show tray notification the first time (once only)
      if (tray && !app.trayNotified) {
        app.trayNotified = true;
        if (tray.displayBalloon) {
          tray.displayBalloon({ title: 'Bookmark Nexus', content: 'Still running in the background. Right-click tray icon to quit.' });
        }
      }
    }
  });

  const isDev = process.env.NODE_ENV==='development' || !app.isPackaged;
  if (isDev) mainWindow.loadURL('http://localhost:5173');
  else       mainWindow.loadFile(path.join(__dirname,'../../dist/index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

app.whenReady().then(async () => {
  // Remove the native File/Edit/View/Window/Help menu bar entirely
  Menu.setApplicationMenu(null);

  await initDB();
  createWindow();
  createTray();
  // After window is ready: initial sync then start live watchers
  mainWindow.webContents.once('did-finish-load', async () => {
    // Small delay to let renderer initialize
    setTimeout(async () => {
      console.log('Running startup sync...');
      const added = await doSync();
      if (added > 0 && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bookmarks-synced', {
          browser: 'startup', added, total: added
        });
      }
      startLiveSync();
    }, 1500);
  });
});

app.on('window-all-closed', () => {
  // On Windows/Linux: hide to tray instead of quitting
  // Actual quit only happens via tray menu or app.isQuitting
  if (process.platform === 'darwin') app.quit();
  // else: stay alive in tray — do NOT call app.quit()
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopLiveSync();
  save();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

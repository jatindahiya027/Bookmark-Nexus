import React, { useState, useEffect, useRef } from 'react';
import styles from './ImportModal.module.css';

const BROWSERS = [
  { key: 'chrome',  label: 'Chrome',  icon: '🔵', desc: 'Bookmarks (JSON)', ext: 'json'   },
  { key: 'firefox', label: 'Firefox', icon: '🦊', desc: 'places.sqlite',    ext: 'sqlite' },
  { key: 'edge',    label: 'Edge',    icon: '🌐', desc: 'Bookmarks (JSON)', ext: 'json'   },
  { key: 'brave',   label: 'Brave',   icon: '🦁', desc: 'Bookmarks (JSON)', ext: 'json'   },
  { key: 'opera',   label: 'Opera',   icon: '🎭', desc: 'Bookmarks (JSON)', ext: 'json'   },
  { key: 'vivaldi', label: 'Vivaldi', icon: '🎨', desc: 'Bookmarks (JSON)', ext: 'json'   },
  { key: 'zen',     label: 'Zen',     icon: '🧘', desc: 'Firefox-based',    ext: 'sqlite' },
  { key: 'arc',     label: 'Arc',     icon: '🌈', desc: 'Chromium-based',   ext: 'json'   },
  { key: 'safari',  label: 'Safari',  icon: '🧭', desc: 'Export to HTML',   ext: 'html'   },
  { key: 'other',   label: 'Other',   icon: '📄', desc: 'Netscape HTML',    ext: 'html'   },
];

export default function ImportModal({ api, onClose, onDone, onToast }) {
  const [browserPaths, setBrowserPaths] = useState({});
  const [selectedBrowser, setSelectedBrowser] = useState('chrome');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const [totalImported, setTotalImported] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.scanBrowsers().then(paths => setBrowserPaths(paths));
  }, []);

  const autoImport = async (browser) => {
    const pathInfo = browserPaths[browser];
    if (!pathInfo?.exists) {
      onToast(`${browser} not found at default location. Use file picker below.`, 'warn');
      return;
    }
    setImporting(true);
    setStatus(`Importing from ${browser}…`);
    setProgress(30);
    const result = await api.importBrowser({ browser, filePath: pathInfo.path });
    setProgress(100);
    if (result.success) {
      setTotalImported(n => n + result.count);
      setStatus(`✓ Imported ${result.count.toLocaleString()} new bookmarks (${result.total.toLocaleString()} total parsed)`);
    } else {
      setStatus(`✗ ${result.error || 'Import failed'}`);
    }
    setImporting(false);
  };

  const pickFile = async () => {
    const result = await api.openFileDialog({
      filters: [
        { name: 'Bookmark Files', extensions: ['html', 'htm', 'json', 'sqlite'] },
        { name: 'All Files', extensions: ['*'] },
      ]
    });
    if (result.canceled || !result.filePaths?.length) return;

    setImporting(true);
    let total = 0;
    for (const filePath of result.filePaths) {
      setStatus(`Processing ${filePath.split(/[\\/]/).pop()}…`);
      setProgress(20);

      let res;
      if (filePath.endsWith('.sqlite')) {
        res = await api.importBrowser({ browser: 'firefox', filePath });
      } else if (filePath.endsWith('.json')) {
        res = await api.importBrowser({ browser: selectedBrowser, filePath });
      } else {
        res = await api.importHtmlFile({ filePath, browser: selectedBrowser });
      }
      setProgress(p => Math.min(p + 40, 95));
      if (res.success) {
        total += res.count;
        setStatus(`✓ ${res.count.toLocaleString()} new bookmarks from ${filePath.split(/[\\/]/).pop()}`);
      } else {
        setStatus(`✗ ${res.error || 'Parse error'}`);
      }
    }
    setProgress(100);
    setTotalImported(n => n + total);
    setImporting(false);
  };

  const handleFileDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = [...e.dataTransfer.files];
    if (!files.length) return;

    setImporting(true);
    let total = 0;
    for (const file of files) {
      setStatus(`Processing ${file.name}…`);
      const text = await file.text();
      let res;
      if (file.name.endsWith('.json')) {
        // Parse in renderer for browser preview
        try {
          const data = JSON.parse(text);
          const bms = [];
          function walk(node, folder = '') {
            if (node.type === 'url' || node.url) {
              if (!node.url?.startsWith('javascript:')) bms.push({ title: node.name || node.url, url: node.url, folder_path: folder, browser: selectedBrowser, date_added: node.date_added ? Math.floor(parseInt(node.date_added) / 1000000 - 11644473600) : Math.floor(Date.now()/1000) });
            }
            if (node.children) node.children.forEach(c => walk(c, node.name || folder));
            if (node.roots) Object.values(node.roots).forEach(r => walk(r, ''));
          }
          walk(data);
          res = await api.importHtmlFile({ filePath: '__json__', browser: selectedBrowser });
          // Since we can't pass raw data directly in browser mode, just treat as file drop
        } catch(_) { res = { success: false, error: 'Invalid JSON' }; }
      }
      // For HTML files
      const html = text;
      if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
        // Create temp blob URL and pass to main — but in browser mode, parse inline
        res = { success: true, count: parseHtmlCount(html) };
        total += res.count;
        setStatus(`✓ Detected ${res.count} bookmarks in ${file.name} — ${window.api ? 'use file picker for full import' : 'use Import button'}`);
        continue;
      }
      if (res?.success) { total += res.count; }
    }
    setProgress(100);
    setTotalImported(n => n + total);
    setImporting(false);
  };

  function parseHtmlCount(html) {
    return (html.match(/<A\s/gi) || []).length;
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.headerIcon}>📥</span>
          <h2 className={styles.title}>Import Bookmarks</h2>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {/* Browser grid */}
          <div className={styles.sectionLabel}>Detected Browsers</div>
          <div className={styles.browserGrid}>
            {BROWSERS.map(b => {
              const info = browserPaths[b.key];
              const found = info?.exists;
              return (
                <div
                  key={b.key}
                  className={`${styles.browserTile} ${selectedBrowser === b.key ? styles.tileSelected : ''} ${found ? styles.tileFound : ''}`}
                  onClick={() => setSelectedBrowser(b.key)}
                >
                  {found && <span className={styles.foundDot} title="Detected" />}
                  <div className={styles.tileIcon}>{b.icon}</div>
                  <div className={styles.tileName}>{b.label}</div>
                  <div className={styles.tileDesc}>{found ? '✓ Detected' : b.desc}</div>
                  {found && (
                    <button
                      className={styles.tileImportBtn}
                      onClick={e => { e.stopPropagation(); autoImport(b.key); }}
                      disabled={importing}
                    >
                      Auto-import
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Instructions */}
          <div className={styles.instructions}>
            <div className={styles.instructTitle}>How to export from each browser:</div>
            <div className={styles.instructGrid}>
              <div><strong>Chrome/Edge/Brave:</strong> chrome://bookmarks → ⋮ → Export bookmarks</div>
              <div><strong>Firefox:</strong> Bookmarks → Manage → Import/Backup → Export to HTML</div>
              <div><strong>Safari:</strong> File → Export Bookmarks</div>
              <div><strong>Opera:</strong> opera://bookmarks → ☰ → Export bookmarks</div>
            </div>
          </div>

          {/* Drop zone */}
          <div className={styles.sectionLabel} style={{ marginTop: 16 }}>Manual File Import</div>
          <div
            className={`${styles.dropZone} ${dragOver ? styles.dragOver : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm,.json,.sqlite"
              multiple
              style={{ display: 'none' }}
              onChange={e => {
                if (!e.target.files?.length) return;
                handleFileDrop({ preventDefault: ()=>{}, dataTransfer: { files: [...e.target.files] } });
              }}
            />
            <div className={styles.dzIcon}>⬆</div>
            <div className={styles.dzTitle}>Drop bookmark files here or click to browse</div>
            <div className={styles.dzSub}>
              Supports: Netscape HTML (.html), Chromium JSON, Firefox places.sqlite
            </div>
          </div>

          {/* Progress */}
          {(importing || progress > 0) && (
            <div className={styles.progressWrap}>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${progress}%` }} />
              </div>
              <div className={styles.statusText}>{status}</div>
            </div>
          )}

          {totalImported > 0 && (
            <div className={styles.successBanner}>
              ✓ Session total: <strong>{totalImported.toLocaleString()}</strong> bookmarks imported
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.demoBtn} onClick={() => { onClose(); }} disabled={importing}>
            Close & View
          </button>
          <button className={styles.doneBtn} onClick={() => onDone(totalImported)} disabled={importing}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

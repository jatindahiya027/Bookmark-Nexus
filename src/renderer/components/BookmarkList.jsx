import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import styles from './BookmarkList.module.css';

const ROW_HEIGHT   = 52;
const BUFFER_ROWS  = 10;

const BROWSER_COLORS = {
  chrome: '#4285f4', firefox: '#ff7139', safari: '#0fb5ee',
  edge: '#0078d4', brave: '#fb542b', opera: '#ff1b2d',
  vivaldi: '#ef3939', zen: '#9b59b6', arc: '#fe5f55', other: '#8b8fa8',
  user: '#3dc1c0',
};
const BROWSER_LABELS = {
  chrome: 'Chrome', firefox: 'Firefox', safari: 'Safari', edge: 'Edge',
  brave: 'Brave', opera: 'Opera', vivaldi: 'Vivaldi', zen: 'Zen', arc: 'Arc', other: 'Other',
  user: 'My Links',
};

function hl(text, q) {
  if (!q || !text) return text || '';
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${safe})`, 'gi'));
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase() ? <mark key={i}>{p}</mark> : p
  );
}

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url; }
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts > 1e10 ? ts : ts * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

// ── Favicon: uses letter fallback, only loads img lazily, no 404 noise ─────────
const faviconCache = {};

const Favicon = memo(function Favicon({ url }) {
  const domain = getDomain(url);
  const letter = (domain?.[0] || '?').toUpperCase();
  const [state, setState] = useState(() => faviconCache[domain] || 'idle'); // idle | loaded | error

  useEffect(() => {
    if (!domain || state !== 'idle') return;
    if (faviconCache[domain] === 'loaded') { setState('loaded'); return; }
    if (faviconCache[domain] === 'error')  { setState('error');  return; }

    const img = new Image();
    img.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    img.onload  = () => { faviconCache[domain] = 'loaded'; setState('loaded'); };
    img.onerror = () => { faviconCache[domain] = 'error';  setState('error');  };
    // No error shown to console — handled gracefully
  }, [domain]);

  if (state === 'loaded') {
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
        className={styles.faviconImg}
        alt=""
      />
    );
  }
  return <span className={styles.faviconFallback}>{letter}</span>;
});

// ── Row — memo so it only re-renders when its own data or selection changes ────
const BookmarkRow = memo(function BookmarkRow({ bm, index, selected, onToggle, onShiftToggle, onContextMenu, onOpen, onDelete, onRestore, onEdit, onLike, search, style, isDeletedView }) {
  const color = BROWSER_COLORS[bm.browser] || BROWSER_COLORS.other;
  const label = BROWSER_LABELS[bm.browser] || bm.browser;
  const tags  = useMemo(() => { try { return JSON.parse(bm.tags || '[]'); } catch { return []; } }, [bm.tags]);
  const [liked, setLiked] = useState(() => bm.is_liked === 1 || bm.is_liked === '1');

  // Sync if bm prop changes (e.g. after refresh)
  useEffect(() => { setLiked(bm.is_liked === 1 || bm.is_liked === '1'); }, [bm.is_liked]);

  const handleClick = useCallback((e) => {
    if (e.shiftKey && onShiftToggle) {
      e.preventDefault();
      onShiftToggle(bm.id, index);
    } else {
      onToggle(bm.id);
    }
  }, [bm.id, index, onToggle, onShiftToggle]);
  const handleCtxMenu    = useCallback((e) => onContextMenu(e, bm), [bm, onContextMenu]);
  const handleOpen       = useCallback((e) => { e.stopPropagation(); onOpen(bm.url); }, [bm.url, onOpen]);
  const handleCopyUrl    = useCallback((e) => { e.stopPropagation(); navigator.clipboard.writeText(bm.url); }, [bm.url]);
  const handleEdit       = useCallback((e) => { e.stopPropagation(); onEdit(bm); }, [bm, onEdit]);
  const handleDelete     = useCallback((e) => { e.stopPropagation(); onDelete(bm.id); }, [bm.id, onDelete]);
  const handleRestore    = useCallback((e) => { e.stopPropagation(); onRestore(bm.id); }, [bm.id, onRestore]);
  const handleLike       = useCallback((e) => {
    e.stopPropagation();
    const next = !liked;
    setLiked(next);
    onLike(bm.id, next);
  }, [bm.id, liked, onLike]);

  const isUserBm = bm.browser === 'user';

  return (
    <div
      className={`${styles.row} ${selected ? styles.rowSelected : ''}`}
      style={style}
      onClick={handleClick}
      onContextMenu={handleCtxMenu}
    >
      <div className={styles.check}>
        {selected && <span className={styles.checkMark}>✓</span>}
      </div>
      <div className={styles.favicon}>
        <Favicon url={bm.url} />
      </div>
      <div className={styles.info}>
        <div className={styles.title}>
          {liked && <span className={styles.likedHeart} title="Liked">♥</span>}
          {isUserBm && <span className={styles.userBadge} title="Manually added">📎</span>}
          {hl(bm.title || 'Untitled', search)}
        </div>
        <div className={styles.urlRow}>
          <span className={styles.url}>{hl(getDomain(bm.url), search)}</span>
          {tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}
          {bm.folder_path && (
            <span className={styles.folder}>📁 {bm.folder_path.split(' / ').pop()}</span>
          )}
        </div>
      </div>
      <div className={styles.meta}>
        <span className={styles.browserBadge} style={{ background: `${color}18`, color, border: `1px solid ${color}33` }}>
          {label}
        </span>
        <span className={styles.date}>{formatDate(bm.date_added)}</span>
      </div>
      <div className={styles.hoverActions}>
        <button
          className={`${styles.hoverBtn} ${liked ? styles.hoverLiked : styles.hoverLikeOff}`}
          onClick={handleLike}
          title={liked ? 'Unlike' : 'Like'}
        >{liked ? '♥' : '♡'}</button>
        <button className={styles.hoverBtn} onClick={handleOpen}    title="Open URL">↗</button>
        <button className={styles.hoverBtn} onClick={handleCopyUrl} title="Copy URL">⧉</button>
        {isDeletedView ? (
          <>
            <button className={`${styles.hoverBtn} ${styles.hoverRestore}`} onClick={handleRestore} title="Restore">↩</button>
            {isUserBm && (
              <button className={`${styles.hoverBtn} ${styles.hoverDel}`} onClick={handleDelete} title="Permanently delete">✕</button>
            )}
          </>
        ) : (
          <>
            <button className={styles.hoverBtn} onClick={handleEdit}    title="Edit">✎</button>
            <button className={`${styles.hoverBtn} ${styles.hoverDel}`} onClick={handleDelete} title="Move to Deleted">✕</button>
          </>
        )}
      </div>
    </div>
  );
}, (prev, next) =>
  prev.selected === next.selected &&
  prev.bm === next.bm &&
  prev.bm?.is_liked === next.bm?.is_liked &&
  prev.search === next.search &&
  prev.isDeletedView === next.isDeletedView &&
  prev.index === next.index &&
  prev.style?.top === next.style?.top
);

// ── Grid card ─────────────────────────────────────────────────────────────────
const BookmarkCard = memo(function BookmarkCard({ bm, selected, onToggle, onContextMenu, onOpen }) {
  const color = BROWSER_COLORS[bm.browser] || BROWSER_COLORS.other;
  const label = BROWSER_LABELS[bm.browser] || bm.browser;
  return (
    <div
      className={`${styles.card} ${selected ? styles.cardSelected : ''}`}
      onClick={() => onToggle(bm.id)}
      onContextMenu={e => onContextMenu(e, bm)}
    >
      <div className={styles.cardCheck}>{selected && '✓'}</div>
      <div className={styles.cardFavicon}><Favicon url={bm.url} /></div>
      <div className={styles.cardTitle}>{bm.title || 'Untitled'}</div>
      <div className={styles.cardDomain}>{getDomain(bm.url)}</div>
      <div className={styles.cardFooter}>
        <span className={styles.browserBadge} style={{ background: `${color}18`, color, border: `1px solid ${color}33` }}>{label}</span>
        <span className={styles.date}>{formatDate(bm.date_added)}</span>
      </div>
    </div>
  );
});

function Empty({ search }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>◈</div>
      <div className={styles.emptyTitle}>{search ? 'No results found' : 'No bookmarks yet'}</div>
      <div className={styles.emptyText}>
        {search
          ? `No bookmarks match "${search}"`
          : 'Import bookmarks using the Import button above.'}
      </div>
    </div>
  );
}

// ── Main list component ────────────────────────────────────────────────────────
// KEY FIX: `selected` is NOT in the query/load effect deps.
// Items are loaded only when queryParams or refreshTick changes.
// Selection state is passed down per-row via the `selected` Set — rows re-render
// individually via memo comparison, NOT by re-fetching data.
export default function BookmarkList({
  queryParams, view, selected, onToggleSelect,
  onContextMenu, onOpenUrl, onDelete, onRestore, onEdit, onLike,
  onRangeSelect,
  search, refreshTick, api, isDeletedView,
}) {
  const [items, setItems]               = useState([]);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(false);
  const [scrollTop, setScrollTop]       = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const containerRef   = useRef(null);
  const prevParamsRef  = useRef(null);
  const prevTickRef    = useRef(-1);
  const loadingRef     = useRef(false);
  const itemsRef       = useRef([]);  // kept in sync for shift-click range access

  // keep itemsRef in sync so shift-click can read current items without stale closure
  useEffect(() => { itemsRef.current = items; }, [items]);

  // ── Load data — only when query or refreshTick actually changes ──────────────
  useEffect(() => {
    const paramsKey = JSON.stringify(queryParams);
    // Skip if nothing relevant changed
    if (paramsKey === prevParamsRef.current && refreshTick === prevTickRef.current) return;
    prevParamsRef.current = paramsKey;
    prevTickRef.current   = refreshTick;

    if (loadingRef.current) return; // prevent concurrent loads
    loadingRef.current = true;
    setLoading(true);

    api.queryBookmarks({ ...queryParams, limit: 50000, offset: 0 })
      .then(result => {
        setItems(result.rows || []);
        setTotal(result.total || 0);
      })
      .catch(err => console.error('queryBookmarks:', err))
      .finally(() => {
        setLoading(false);
        loadingRef.current = false;
      });
  // NOTE: `selected` is intentionally NOT in this dep array.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams, refreshTick]);

  const lastSelectedIndexRef = useRef(null);  // anchor index (set on plain click)
  const lastRangeRef = useRef([]);             // previously shift-selected ids (to remove on shrink)

  // Shift+click: select exactly anchor→clicked range, replacing the previous shift-range
  const handleShiftToggle = useCallback((id, index) => {
    const anchor = lastSelectedIndexRef.current;
    if (anchor === null) {
      // No anchor yet — treat as plain click and set anchor
      onToggleSelect(id);
      lastSelectedIndexRef.current = index;
      lastRangeRef.current = [];
      return;
    }
    const lo = Math.min(anchor, index);
    const hi = Math.max(anchor, index);
    const newRangeIds = itemsRef.current.slice(lo, hi + 1).map(b => b.id);

    if (onRangeSelect) {
      onRangeSelect({
        add: newRangeIds,
        remove: lastRangeRef.current.filter(rid => !newRangeIds.includes(rid)),
      });
    }
    // Update the range but NOT the anchor — anchor stays until next plain click
    lastRangeRef.current = newRangeIds;
  }, [onToggleSelect, onRangeSelect]);

  // Plain click: updates anchor, clears previous shift-range tracking
  const handleToggleWithAnchor = useCallback((id) => {
    const idx = itemsRef.current.findIndex(b => b.id === id);
    lastSelectedIndexRef.current = idx >= 0 ? idx : null;
    lastRangeRef.current = [];
    onToggleSelect(id);
  }, [onToggleSelect]);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerHeight(el.clientHeight));
    ro.observe(el);
    setContainerHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // ── Scroll handler — debounced to avoid excessive re-renders ──────────────
  const scrollTimer = useRef(null);
  const handleScroll = useCallback((e) => {
    const st = e.target.scrollTop;
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => setScrollTop(st), 10);
  }, []);

  // ── Virtual list calculation ──────────────────────────────────────────────
  const virtualBounds = useMemo(() => {
    if (view !== 'list' || !items.length) return null;
    const totalH  = items.length * ROW_HEIGHT;
    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
    const endIdx   = Math.min(items.length - 1, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER_ROWS);
    return { totalH, startIdx, endIdx };
  }, [view, items.length, scrollTop, containerHeight]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading bookmarks…</span>
        </div>
      </div>
    );
  }

  if (!items.length) {
    return <div className={styles.container}><Empty search={search} /></div>;
  }

  // ── List view ─────────────────────────────────────────────────────────────
  if (view === 'list') {
    const { totalH, startIdx, endIdx } = virtualBounds;
    return (
      <div className={styles.container} ref={containerRef} onScroll={handleScroll}>
        <div style={{ height: totalH, position: 'relative' }}>
          {items.slice(startIdx, endIdx + 1).map((bm, i) => (
            <BookmarkRow
              key={bm.id}
              bm={bm}
              index={startIdx + i}
              selected={selected.has(bm.id)}
              onToggle={handleToggleWithAnchor}
              onShiftToggle={handleShiftToggle}
              onContextMenu={onContextMenu}
              onOpen={onOpenUrl}
              onDelete={onDelete}
              onRestore={onRestore}
              onEdit={onEdit}
              onLike={onLike}
              search={search}
              isDeletedView={isDeletedView}
              style={{
                position: 'absolute',
                top: (startIdx + i) * ROW_HEIGHT,
                left: 0, right: 0,
                height: ROW_HEIGHT,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Grid view ─────────────────────────────────────────────────────────────
  if (view === 'grid') {
    return (
      <div className={styles.container} ref={containerRef}>
        <div className={styles.grid}>
          {items.map(bm => (
            <BookmarkCard
              key={bm.id}
              bm={bm}
              selected={selected.has(bm.id)}
              onToggle={onToggleSelect}
              onContextMenu={onContextMenu}
              onOpen={onOpenUrl}
            />
          ))}
        </div>
      </div>
    );
  }

  // analytics fallback
  return (
    <div className={styles.container} ref={containerRef} onScroll={handleScroll}>
      <div style={{ height: items.length * ROW_HEIGHT, position: 'relative' }}>
        {items.slice(0, Math.ceil(containerHeight / ROW_HEIGHT) + BUFFER_ROWS).map((bm, i) => (
          <BookmarkRow
            key={bm.id} bm={bm} index={i} selected={selected.has(bm.id)}
            onToggle={handleToggleWithAnchor} onShiftToggle={handleShiftToggle}
            onContextMenu={onContextMenu}
            onOpen={onOpenUrl} onDelete={onDelete} onRestore={onRestore} onEdit={onEdit} onLike={onLike}
            search={search} isDeletedView={isDeletedView}
            style={{ position: 'absolute', top: i * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT }}
          />
        ))}
      </div>
    </div>
  );
}

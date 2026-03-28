import React, { useRef } from 'react';
import styles from './Toolbar.module.css';

const SORT_OPTIONS = [
  { key: 'date_added', label: 'Date Added' },
  { key: 'title', label: 'Title' },
  { key: 'url', label: 'URL / Domain' },
  { key: 'browser', label: 'Browser' },
  { key: 'folder_path', label: 'Folder' },
];

export default function Toolbar({
  search, onSearch, view, onView, sort, onSort,
  selected, onSelectAll, onDeselectAll,
  onDelete, onRestore, onExport, onTag, onImport, total,
  isDeletedView,
}) {
  const selCount = selected.size;
  const hasSelection = selCount > 0;

  const toggleSort = (key) => {
    if (sort.key === key) {
      onSort({ key, dir: sort.dir === 'desc' ? 'asc' : 'desc' });
    } else {
      onSort({ key, dir: 'desc' });
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        {/* Search */}
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            id="search-input"
            className={styles.search}
            type="text"
            placeholder="Search titles, URLs, folders, tags… (⌘F)  ·  Ctrl+V to add a URL"
            value={search}
            onChange={e => onSearch(e.target.value)}
            autoComplete="off"
          />
          {search && (
            <button className={styles.clearSearch} onClick={() => onSearch('')}>✕</button>
          )}
        </div>

        {/* Sort */}
        <div className={styles.sortGroup}>
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.key}
              className={`${styles.sortBtn} ${sort.key === opt.key ? styles.sortActive : ''}`}
              onClick={() => toggleSort(opt.key)}
            >
              {opt.label}
              {sort.key === opt.key && (
                <span className={styles.sortDir}>{sort.dir === 'desc' ? '↓' : '↑'}</span>
              )}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewBtn} ${view === 'list' ? styles.viewActive : ''}`}
            onClick={() => onView('list')}
            title="List view"
          >☰</button>
          <button
            className={`${styles.viewBtn} ${view === 'grid' ? styles.viewActive : ''}`}
            onClick={() => onView('grid')}
            title="Grid view"
          >⊞</button>
          <button
            className={`${styles.viewBtn} ${view === 'analytics' ? styles.viewActive : ''}`}
            onClick={() => onView(view === 'analytics' ? 'list' : 'analytics')}
            title="Analytics"
          >◎</button>
        </div>

        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onImport}>
          <span>＋</span> Import
        </button>
      </div>

      {/* Selection bar */}
      {hasSelection && (
        <div className={styles.selBar}>
          <span className={styles.selInfo}>
            <span className={styles.selCount}>{selCount.toLocaleString()}</span>
            <span className={styles.selOf}> of {total.toLocaleString()} selected</span>
          </span>
          <button className={styles.selBtn} onClick={onSelectAll}>Select All</button>
          <button className={styles.selBtn} onClick={onDeselectAll}>Deselect</button>
          {isDeletedView ? (
            <button className={`${styles.selBtn} ${styles.selRestore}`} onClick={onRestore}>
              ↩ Restore {selCount}
            </button>
          ) : (
            <>
              <button className={styles.selBtn} onClick={onTag}>🏷 Tag</button>
              <button className={styles.selBtn} onClick={() => onExport()}>↑ Export</button>
              <button className={`${styles.selBtn} ${styles.selDanger}`} onClick={onDelete}>
                🗑 Delete {selCount}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

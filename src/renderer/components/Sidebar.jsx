import React, { useState } from 'react';
import styles from './Sidebar.module.css';

const BROWSER_META = {
  chrome:  { label: 'Chrome',  color: 'var(--c-chrome)',  icon: '●' },
  firefox: { label: 'Firefox', color: 'var(--c-firefox)', icon: '●' },
  safari:  { label: 'Safari',  color: 'var(--c-safari)',  icon: '●' },
  edge:    { label: 'Edge',    color: 'var(--c-edge)',    icon: '●' },
  brave:   { label: 'Brave',   color: 'var(--c-brave)',   icon: '●' },
  opera:   { label: 'Opera',   color: 'var(--c-opera)',   icon: '●' },
  vivaldi: { label: 'Vivaldi', color: 'var(--c-vivaldi)', icon: '●' },
  zen:     { label: 'Zen',     color: '#9b59b6',           icon: '●' },
  arc:     { label: 'Arc',     color: '#fe5f55',           icon: '●' },
  other:   { label: 'Other',   color: 'var(--c-other)',   icon: '●' },
};

export default function Sidebar({ stats, tags, activeFilter, onFilter, onDeleteDupes, onImport, onDemo, scanning, syncStatus, onForceSync, onPurgeDeleted, onDeleteTag }) {
  const [foldersExpanded, setFoldersExpanded] = useState(true);
  const [browsersExpanded, setBrowsersExpanded] = useState(true);
  const [tagsExpanded, setTagsExpanded] = useState(true);

  const isActive = (type, value) =>
    activeFilter.type === type && (!value || activeFilter.value === value);

  const browsers = stats?.browsers || [];
  const topFolders = stats?.topFolders || [];

  return (
    <aside className={styles.sidebar}>
      {/* ── Views ── */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Library</div>

        <NavItem icon="⊞" label="All Bookmarks" count={stats?.total}
          active={isActive('all')} onClick={() => onFilter({ type: 'all' })} />
        <NavItem icon="◷" label="Recent (30d)" count={stats?.recent}
          active={isActive('recent')} onClick={() => onFilter({ type: 'recent' })} />
        <NavItem icon="♥" label="Liked" count={stats?.liked ?? 0}
          active={isActive('liked')} onClick={() => onFilter({ type: 'liked' })}
          accent={stats?.liked > 0 ? 'liked' : undefined} />
        <NavItem icon="⚠" label="Duplicates" count={stats?.dupes}
          active={isActive('duplicates')} onClick={() => onFilter({ type: 'duplicates' })}
          accent="red" />
        <NavItem icon="◻" label="Untagged" count={stats?.untagged}
          active={isActive('untagged')} onClick={() => onFilter({ type: 'untagged' })} />
        {stats?.dead > 0 && (
          <NavItem icon="✕" label="Dead Links" count={stats?.dead}
            active={isActive('dead')} onClick={() => onFilter({ type: 'dead' })}
            accent="red" />
        )}
        <NavItem icon="🗑" label="Deleted" count={stats?.deleted ?? 0}
          active={isActive('deleted')} onClick={() => onFilter({ type: 'deleted' })}
          accent={stats?.deleted > 0 ? 'muted' : undefined} />
      </div>

      <div className={styles.divider} />

      {/* ── Browsers ── */}
      <div className={styles.section}>
        <button className={styles.sectionLabel} onClick={() => setBrowsersExpanded(e => !e)}>
          Browsers <span className={styles.chevron}>{browsersExpanded ? '▾' : '▸'}</span>
        </button>
        {browsersExpanded && browsers.map(({ browser, count }) => {
          const meta = BROWSER_META[browser] || BROWSER_META.other;
          return (
            <NavItem
              key={browser}
              icon={<span style={{ color: meta.color, fontSize: 10 }}>●</span>}
              label={meta.label}
              count={count}
              active={isActive('browser', browser)}
              onClick={() => onFilter({ type: 'browser', value: browser })}
            />
          );
        })}
      </div>

      <div className={styles.divider} />

      {/* ── Folders ── */}
      {topFolders.length > 0 && (
        <div className={styles.section}>
          <button className={styles.sectionLabel} onClick={() => setFoldersExpanded(e => !e)}>
            Folders <span className={styles.chevron}>{foldersExpanded ? '▾' : '▸'}</span>
          </button>
          {foldersExpanded && topFolders.slice(0, 12).map(({ name, count }) => (
            <NavItem
              key={name}
              icon="📁"
              label={name}
              count={count}
              active={isActive('folder', name)}
              onClick={() => onFilter({ type: 'folder', value: name })}
            />
          ))}
        </div>
      )}

      {/* ── Tags ── */}
      {tags.length > 0 && (
        <>
          <div className={styles.divider} />
          <div className={styles.section}>
            <div className={styles.sectionRow}>
              <button className={styles.sectionLabel} onClick={() => setTagsExpanded(e => !e)}>
                Tags <span className={styles.chevron}>{tagsExpanded ? '▾' : '▸'}</span>
              </button>
              {isActive('tag') && (
                <button className={styles.clearFilter} onClick={() => onFilter({ type: 'all' })} title="Clear tag filter">
                  ✕ clear
                </button>
              )}
            </div>
            {tagsExpanded && (
              <div className={styles.tagCloud}>
                {tags.slice(0, 20).map(t => (
                  <div key={t.name} className={styles.tagRow}>
                    <button
                      className={`${styles.tagChip} ${isActive('tag', t.name) ? styles.tagActive : ''}`}
                      onClick={() => onFilter(isActive('tag', t.name) ? { type: 'all' } : { type: 'tag', value: t.name })}
                    >
                      {t.name}
                      {t.count > 0 && <span className={styles.tagCount}>{t.count}</span>}
                    </button>
                    <button
                      className={styles.tagDelete}
                      title={`Delete tag "${t.name}" from all bookmarks`}
                      onClick={(e) => { e.stopPropagation(); onDeleteTag(t.name); }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className={styles.spacer} />
      <div className={styles.divider} />

      {/* ── Actions ── */}
      <div className={styles.actions}>
        {/* Sync status pill */}
        {syncStatus?.count > 0 && (
          <div className={styles.syncStatus}>
            <span className={styles.syncDot} />
            Watching {syncStatus.count} browser file{syncStatus.count !== 1 ? 's' : ''}
          </div>
        )}
        <button className={styles.actionBtn} onClick={onImport}>
          <span>＋</span> Import Bookmarks
        </button>
        {onForceSync && (
          <button className={`${styles.actionBtn} ${styles.actionSync}`} onClick={onForceSync} disabled={scanning}>
            <span>{scanning ? '⟳' : '⟳'}</span> {scanning ? 'Syncing…' : 'Sync All Browsers'}
          </button>
        )}
        {stats?.dupes > 0 && (
          <button className={`${styles.actionBtn} ${styles.actionDanger}`} onClick={onDeleteDupes}>
            <span>⚠</span> Remove {stats.dupes} Dupes
          </button>
        )}
        {stats?.deleted > 0 && (
          <button className={`${styles.actionBtn} ${styles.actionDanger}`} onClick={onPurgeDeleted}>
            <span>🗑</span> Purge {stats.deleted} My Deleted
          </button>
        )}
        <button className={`${styles.actionBtn} ${styles.actionMuted}`} onClick={onDemo} disabled={scanning}>
          <span>{scanning ? '⟳' : '⚡'}</span> {scanning ? 'Generating…' : 'Load Demo (10k)'}
        </button>
      </div>
    </aside>
  );
}

function NavItem({ icon, label, count, active, onClick, accent }) {
  return (
    <button
      className={`${styles.navItem} ${active ? styles.navActive : ''} ${accent ? styles[`navAccent_${accent}`] : ''}`}
      onClick={onClick}
    >
      <span className={styles.navIcon}>{icon}</span>
      <span className={styles.navLabel}>{label}</span>
      {count !== undefined && (
        <span className={styles.navCount}>{Number(count).toLocaleString()}</span>
      )}
    </button>
  );
}

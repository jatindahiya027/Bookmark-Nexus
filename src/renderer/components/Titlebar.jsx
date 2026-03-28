import React from 'react';
import styles from './Titlebar.module.css';

export default function Titlebar({ stats, syncStatus, onForceSync, scanning }) {
  return (
    <div className={styles.bar}>
      <div className={styles.logo}>
        <span className={styles.logoMark}>◈</span>
        <span className={styles.logoText}>Bookmark<span className={styles.logoAccent}>Nexus</span></span>
      </div>

      <div className={styles.stats}>
        {stats && (
          <>
            <Pill color="amber" value={stats.total?.toLocaleString() || '0'} label="total" />
            <Pill color="teal" value={stats.recent?.toLocaleString() || '0'} label="recent" />
            <Pill color="red" value={stats.dupes?.toLocaleString() || '0'} label="dupes" />
            <Pill color="purple" value={(stats.browsers?.length || 0).toString()} label="browsers" />
          </>
        )}
        {syncStatus?.count > 0 && (
          <button
            className={styles.syncBtn}
            onClick={onForceSync}
            disabled={scanning}
            title={`Live sync active — watching ${syncStatus.count} browser file${syncStatus.count !== 1 ? 's' : ''}. Click to force sync.`}
          >
            <span className={styles.syncLed} />
            {scanning ? 'Syncing…' : 'Live Sync'}
          </button>
        )}
      </div>

      <div className={styles.winControls}>
        <div className={`${styles.winBtn} ${styles.close}`} title="Close" />
        <div className={`${styles.winBtn} ${styles.minimize}`} title="Minimize" />
        <div className={`${styles.winBtn} ${styles.maximize}`} title="Maximize" />
      </div>
    </div>
  );
}

function Pill({ color, value, label }) {
  return (
    <div className={`${styles.pill} ${styles[`pill_${color}`]}`}>
      <span className={styles.pillVal}>{value}</span>
      <span className={styles.pillLabel}>{label}</span>
    </div>
  );
}

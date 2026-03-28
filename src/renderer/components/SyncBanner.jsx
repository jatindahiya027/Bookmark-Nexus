import React from 'react';

export default function SyncBanner({ events, onDismiss }) {
  if (!events || events.length === 0) return null;
  const latest = events[0];
  const extra = events.length - 1;

  const browserColors = {
    chrome: '#4285f4', firefox: '#ff6611', edge: '#0078d4', brave: '#fb542b',
    opera: '#ff1b2d', vivaldi: '#ef3939', zen: '#9b59b6', arc: '#fe5f55',
  };
  const color = browserColors[latest.browser] || 'var(--c-teal)';

  const s = {
    banner: {
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '7px 14px', background: 'rgba(61,217,192,0.07)',
      borderBottom: '1px solid rgba(61,217,192,0.2)',
      fontSize: 12, color: 'var(--c-text2)', fontFamily: 'var(--font-ui)',
      animation: 'slideDown 0.25s ease',
    },
    dot: { width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 },
    msg:  { flex: 1 },
    tag:  { background: 'rgba(61,217,192,0.12)', color: 'var(--c-teal)', padding: '1px 7px', borderRadius: 3, fontSize: 10.5, fontWeight: 600 },
    more: { color: 'var(--c-text3)', fontSize: 11 },
    btn:  { background: 'none', border: 'none', color: 'var(--c-text3)', cursor: 'pointer', fontSize: 13, padding: '0 4px' },
  };

  return (
    <div style={s.banner}>
      <div style={s.dot} />
      <span style={s.tag}>AUTO-SYNC</span>
      <span style={s.msg}>
        <strong style={{ color: 'var(--c-text)' }}>{latest.added}</strong> new bookmark{latest.added !== 1 ? 's' : ''} detected in{' '}
        <strong style={{ color }}>{latest.browser}</strong>
        {extra > 0 && <span style={s.more}> (+{extra} more event{extra > 1 ? 's' : ''})</span>}
      </span>
      <button style={s.btn} onClick={onDismiss} title="Dismiss">✕</button>
    </div>
  );
}

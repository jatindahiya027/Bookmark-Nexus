// AnalyticsPanel.jsx
import React from 'react';

const COLORS = ['#f5a623','#3dd9c0','#9d7ef5','#ff5f5f','#4ecf7e','#4285f4','#ff7139','#0fb5ee'];

export default function AnalyticsPanel({ stats }) {
  if (!stats) return null;
  const browsers = stats.browsers || [];
  const topFolders = (stats.topFolders || []).slice(0, 8);
  const topDomains = (stats.topDomains || []).slice(0, 10);
  const maxFolder = topFolders[0]?.count || 1;
  const maxDomain = topDomains[0]?.count || 1;

  return (
    <div style={{
      width: 280, background: 'var(--c-surface)', borderLeft: '1px solid var(--c-border)',
      overflowY: 'auto', padding: '16px', flexShrink: 0,
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--c-text)' }}>
        Analytics
      </div>

      {/* Browser breakdown */}
      <Section title="By Browser">
        {browsers.map(({ browser, count }, i) => (
          <BarRow key={browser} label={browser} value={count} max={stats.total || 1} color={COLORS[i % COLORS.length]} />
        ))}
      </Section>

      {/* Top folders */}
      {topFolders.length > 0 && (
        <Section title="Top Folders">
          {topFolders.map(({ name, count }, i) => (
            <BarRow key={name} label={name.split(' / ').pop()} value={count} max={maxFolder} color={COLORS[i % COLORS.length]} />
          ))}
        </Section>
      )}

      {/* Top domains */}
      {topDomains.length > 0 && (
        <Section title="Top Domains">
          {topDomains.map(({ domain, count }, i) => (
            <BarRow key={domain} label={domain} value={count} max={maxDomain} color={COLORS[i % COLORS.length]} />
          ))}
        </Section>
      )}

      {/* Summary */}
      <Section title="Summary">
        <StatRow label="Total" value={stats.total?.toLocaleString()} />
        <StatRow label="Recent (30d)" value={stats.recent?.toLocaleString()} />
        <StatRow label="Duplicates" value={stats.dupes?.toLocaleString()} accent="var(--c-red)" />
        <StatRow label="Untagged" value={stats.untagged?.toLocaleString()} />
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--c-text3)', marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function BarRow({ label, value, max, color }) {
  const pct = Math.max(3, (value / max) * 100);
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: 'var(--c-text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--c-text3)', fontSize: 10, marginLeft: 6 }}>{value?.toLocaleString()}</span>
      </div>
      <div style={{ height: 3, background: 'var(--c-surface3)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

function StatRow({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--c-border)', fontSize: 12 }}>
      <span style={{ color: 'var(--c-text2)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', color: accent || 'var(--c-text)' }}>{value || '0'}</span>
    </div>
  );
}

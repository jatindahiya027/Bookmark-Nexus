// TagModal.jsx
import React, { useState } from 'react';

export function TagModal({ existingTags, count, onConfirm, onClose }) {
  const [tag, setTag] = useState('');
  const [color, setColor] = useState('#3dd9c0');

  const s = {
    overlay: { position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)',zIndex:1100,display:'flex',alignItems:'center',justifyContent:'center' },
    modal: { background:'var(--c-surface)',border:'1px solid var(--c-border2)',borderRadius:'var(--r-xl)',width:380,padding:'20px',boxShadow:'0 24px 60px rgba(0,0,0,0.4)' },
    title: { fontFamily:'var(--font-display)',fontSize:16,fontWeight:600,marginBottom:16,display:'flex',alignItems:'center',gap:10 },
    label: { fontSize:11,color:'var(--c-text3)',marginBottom:6,display:'block' },
    input: { width:'100%',padding:'8px 12px',borderRadius:'var(--r-md)',border:'1px solid var(--c-border2)',background:'var(--c-surface2)',color:'var(--c-text)',fontSize:13,outline:'none',fontFamily:'var(--font-ui)',marginBottom:12 },
    row: { display:'flex',gap:8,marginBottom:12,flexWrap:'wrap' },
    chip: { padding:'3px 10px',borderRadius:4,fontSize:11,background:'var(--c-surface2)',border:'1px solid var(--c-border2)',color:'var(--c-text2)',cursor:'pointer' },
    footer: { display:'flex',gap:8,justifyContent:'flex-end',marginTop:8 },
    cancel: { padding:'8px 14px',borderRadius:'var(--r-md)',border:'1px solid var(--c-border2)',background:'var(--c-surface2)',color:'var(--c-text2)',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'var(--font-ui)' },
    confirm: { padding:'8px 16px',borderRadius:'var(--r-md)',background:'var(--c-accent)',border:'none',color:'#0d0e14',cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'var(--font-ui)' },
  };

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.modal}>
        <div style={s.title}>🏷 Tag {count} bookmark{count !== 1 ? 's' : ''}</div>
        <label style={s.label}>Tag name</label>
        <input style={s.input} value={tag} onChange={e => setTag(e.target.value)} placeholder="e.g. design, research, work" autoFocus onKeyDown={e => e.key === 'Enter' && tag && onConfirm(tag, color)} />
        {existingTags.length > 0 && (
          <>
            <label style={s.label}>Existing tags</label>
            <div style={s.row}>
              {existingTags.slice(0,10).map(t => (
                <button key={t.name} style={s.chip} onClick={() => setTag(t.name)}>{t.name}</button>
              ))}
            </div>
          </>
        )}
        <div style={s.footer}>
          <button style={s.cancel} onClick={onClose}>Cancel</button>
          <button style={s.confirm} onClick={() => tag && onConfirm(tag, color)} disabled={!tag}>Apply Tag</button>
        </div>
      </div>
    </div>
  );
}

// EditModal.jsx
export function EditModal({ bookmark, api, onClose, onSaved }) {
  const [title, setTitle] = useState(bookmark.title || '');
  const [url, setUrl] = useState(bookmark.url || '');
  const [folder, setFolder] = useState(bookmark.folder_path || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await api.updateBookmark({ id: bookmark.id, data: { title, url, folder_path: folder } });
    setSaving(false);
    onSaved();
  };

  const s = {
    overlay: { position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)',zIndex:1100,display:'flex',alignItems:'center',justifyContent:'center' },
    modal: { background:'var(--c-surface)',border:'1px solid var(--c-border2)',borderRadius:'var(--r-xl)',width:440,padding:'20px',boxShadow:'0 24px 60px rgba(0,0,0,0.4)' },
    title: { fontFamily:'var(--font-display)',fontSize:16,fontWeight:600,marginBottom:16,display:'flex',alignItems:'center',justifyContent:'space-between' },
    label: { fontSize:11,color:'var(--c-text3)',marginBottom:5,display:'block',marginTop:10 },
    input: { width:'100%',padding:'8px 12px',borderRadius:'var(--r-md)',border:'1px solid var(--c-border2)',background:'var(--c-surface2)',color:'var(--c-text)',fontSize:13,outline:'none',fontFamily:'var(--font-ui)' },
    footer: { display:'flex',gap:8,justifyContent:'flex-end',marginTop:18 },
    cancel: { padding:'8px 14px',borderRadius:'var(--r-md)',border:'1px solid var(--c-border2)',background:'var(--c-surface2)',color:'var(--c-text2)',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'var(--font-ui)' },
    save: { padding:'8px 18px',borderRadius:'var(--r-md)',background:'var(--c-accent)',border:'none',color:'#0d0e14',cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'var(--font-ui)',opacity: saving ? 0.7 : 1 },
    close: { background:'none',border:'none',color:'var(--c-text2)',cursor:'pointer',fontSize:16,padding:'0 4px' },
  };

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.modal}>
        <div style={s.title}>
          <span>✎ Edit Bookmark</span>
          <button style={s.close} onClick={onClose}>✕</button>
        </div>
        <label style={s.label}>Title</label>
        <input style={s.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Bookmark title" />
        <label style={s.label}>URL</label>
        <input style={s.input} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
        <label style={s.label}>Folder</label>
        <input style={s.input} value={folder} onChange={e => setFolder(e.target.value)} placeholder="e.g. Development / React" />
        <div style={s.footer}>
          <button style={s.cancel} onClick={onClose}>Cancel</button>
          <button style={s.save} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

// ContextMenu.jsx
export function ContextMenu({ x, y, bookmark, isSelected, isDeletedView, onClose, onOpen, onCopyUrl, onCopyTitle, onSelect, onEdit, onDelete, onRestore, onTag }) {
  const vx = Math.min(x, window.innerWidth - 200);
  const vy = Math.min(y, window.innerHeight - 280);

  React.useEffect(() => {
    const handler = (e) => { if (!e.target.closest('[data-ctx]')) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const s = {
    menu: { position:'fixed',left:vx,top:vy,background:'var(--c-surface2)',border:'1px solid var(--c-border2)',borderRadius:'var(--r-md)',minWidth:200,padding:'4px',zIndex:2000,boxShadow:'0 8px 32px rgba(0,0,0,0.4)',animation:'scaleIn 0.12s ease' },
    item: { display:'flex',alignItems:'center',gap:9,padding:'7px 12px',borderRadius:5,cursor:'pointer',fontSize:12,color:'var(--c-text2)',fontFamily:'var(--font-ui)',transition:'all 0.1s',background:'none',border:'none',width:'100%',textAlign:'left' },
    div: { height:1,background:'var(--c-border)',margin:'3px 0' },
    subLabel: { padding:'4px 12px 2px',fontSize:10,color:'var(--c-text4)',fontFamily:'var(--font-ui)',letterSpacing:'0.05em',textTransform:'uppercase' },
  };

  const Item = ({ icon, label, sublabel, onClick, danger, success }) => (
    <button style={{ ...s.item, color: danger ? 'var(--c-red)' : success ? '#34c759' : undefined }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? 'rgba(255,80,80,0.08)' : success ? 'rgba(52,199,89,0.08)' : 'var(--c-surface3)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}
      onClick={() => { onClick(); onClose(); }}>
      <span style={{fontSize:13}}>{icon}</span>
      <span style={{flex:1}}>
        {label}
        {sublabel && <span style={{display:'block',fontSize:10,color:'var(--c-text4)',marginTop:1}}>{sublabel}</span>}
      </span>
    </button>
  );

  return (
    <div data-ctx style={s.menu}>
      <Item icon="↗" label="Open URL" onClick={onOpen} />
      <Item icon="⧉" label="Copy URL" onClick={onCopyUrl} />
      <Item icon="📝" label="Copy Title" onClick={onCopyTitle} />
      <div style={s.div} />
      <Item icon={isSelected ? '☐' : '☑'} label={isSelected ? 'Deselect' : 'Select'} onClick={onSelect} />
      {isDeletedView ? (
        <>
          <div style={s.div} />
          <div style={s.subLabel}>Deleted</div>
          <Item icon="↩" label="Restore bookmark" sublabel="Moves back to All Bookmarks" onClick={onRestore} success />
        </>
      ) : (
        <>
          <Item icon="✎" label="Edit" onClick={onEdit} />
          <Item icon="🏷" label="Add Tag" onClick={onTag} />
          <div style={s.div} />
          <div style={s.subLabel}>Delete</div>
          <Item icon="🗑" label="Move to Deleted" sublabel="Can be restored later" onClick={onDelete} danger />
        </>
      )}
    </div>
  );
}

// StatusBar.jsx
export function StatusBar({ stats, selected, sort, filter }) {
  const total = stats?.total || 0;
  const selCount = selected?.size || 0;
  const sortLabel = sort ? `${sort.key.replace('_', ' ')} ${sort.dir === 'desc' ? '↓' : '↑'}` : '';
  const filterLabel = filter?.type === 'all' ? 'All' : filter?.type === 'browser' ? filter.value : filter?.type;

  const s = {
    bar: { height:'var(--statusbar-h)',background:'var(--c-surface)',borderTop:'1px solid var(--c-border)',display:'flex',alignItems:'center',padding:'0 14px',gap:20,fontFamily:'var(--font-mono)',fontSize:10.5,color:'var(--c-text3)',flexShrink:0 },
    dot: { width:5,height:5,borderRadius:'50%',background:'var(--c-teal)',display:'inline-block',marginRight:4 },
    sep: { color:'var(--c-text4)' },
  };

  return (
    <div style={s.bar}>
      <span><span style={s.dot}/>  {total.toLocaleString()} bookmarks</span>
      <span style={s.sep}>│</span>
      {selCount > 0 && <><span style={{ color: 'var(--c-accent)' }}>{selCount} selected</span><span style={s.sep}>│</span></>}
      <span>Sort: {sortLabel}</span>
      <span style={s.sep}>│</span>
      <span>Filter: {filterLabel}</span>
      <span style={{ marginLeft: 'auto' }}>Bookmark Nexus v1.0</span>
    </div>
  );
}

// Toast.jsx
export function Toast({ toasts }) {
  const icons = { success: '✓', error: '✕', warn: '⚠', info: 'ℹ' };
  const colors = { success: 'var(--c-teal)', error: 'var(--c-red)', warn: 'var(--c-accent)', info: 'var(--c-purple)' };

  return (
    <div style={{ position:'fixed',bottom:30,right:20,display:'flex',flexDirection:'column',gap:8,zIndex:3000 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display:'flex',alignItems:'center',gap:9,
          padding:'10px 16px',
          background:'var(--c-surface2)',
          border:`1px solid ${colors[t.type] || 'var(--c-border2)'}33`,
          borderLeft:`3px solid ${colors[t.type] || 'var(--c-border2)'}`,
          borderRadius:'var(--r-md)',
          fontSize:12.5,
          color:'var(--c-text)',
          boxShadow:'0 4px 20px rgba(0,0,0,0.3)',
          minWidth:220,maxWidth:340,
          animation:'fadeIn 0.2s ease',
          fontFamily:'var(--font-ui)',
        }}>
          <span style={{ color: colors[t.type], fontSize:13 }}>{icons[t.type] || 'ℹ'}</span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export default { TagModal, EditModal, ContextMenu, StatusBar, Toast };

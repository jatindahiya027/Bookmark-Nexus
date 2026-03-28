import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Titlebar from './components/Titlebar';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import BookmarkList from './components/BookmarkList';
import ImportModal from './components/ImportModal';
import { TagModal } from './components/Modals';
import { EditModal } from './components/Modals';
import { ContextMenu } from './components/Modals';
import { StatusBar } from './components/Modals';
import { Toast } from './components/Modals';
import AnalyticsPanel from './components/AnalyticsPanel';
import SyncBanner from './components/SyncBanner';
import styles from './styles/App.module.css';

// ── API bridge ────────────────────────────────────────────────────────────────
const api = window.api || createMockApi();

function createMockApi() {
  let store = [], nextId = 1;
  const sh = s => { let h=0; for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;} return h.toString(16); };
  const ins = bms => { const a=bms.filter(b=>!store.find(x=>x.url_hash===b.url_hash&&x.browser===b.browser)).map(b=>({...b,id:nextId++,tags:'[]'})); store.push(...a); return a.length; };
  return {
    scanBrowsers: async () => ({
      chrome:  {exists:false,path:'C:\\...\\Chrome\\User Data\\Default\\Bookmarks',type:'chromium'},
      firefox: {exists:false,path:'C:\\...\\Firefox\\Profiles\\...\\places.sqlite',type:'firefox'},
      edge:    {exists:false,path:'C:\\...\\Edge\\User Data\\Default\\Bookmarks',type:'chromium'},
      brave:   {exists:false,path:'C:\\...\\Brave-Browser\\User Data\\Default\\Bookmarks',type:'chromium'},
      opera:   {exists:false,path:'C:\\...\\Opera Stable\\Bookmarks',type:'chromium'},
      vivaldi: {exists:false,path:'',type:'chromium'},
      zen:     {exists:false,path:'',type:'firefox'},
      arc:     {exists:false,path:'~/Library/Application Support/Arc/User Data/Default/Bookmarks',type:'chromium'},
    }),
    importBrowser:    async () => ({success:false, error:'Run in Electron for real imports'}),
    importHtmlFile:   async () => ({success:false, error:'Run in Electron'}),
    openFileDialog:   async () => ({canceled:true}),
    queryBookmarks: async ({search,browser,folder,filter,tag,sortKey,sortDir,limit,offset}) => {
      let bms = filter==='deleted' ? store.filter(b=>b.is_deleted) : store.filter(b=>!b.is_deleted);
      if (search){const q=search.toLowerCase();bms=bms.filter(b=>(b.title||'').toLowerCase().includes(q)||(b.url||'').toLowerCase().includes(q)||(b.folder_path||'').toLowerCase().includes(q)||(b.tags||'').toLowerCase().includes(q));}
      if (tag) bms=bms.filter(b=>(b.tags||'').includes(tag));
      if (browser&&browser!=='all') bms=bms.filter(b=>b.browser===browser);
      if (folder) bms=bms.filter(b=>(b.folder_path||'').includes(folder));
      if (filter==='recent'){const c=Math.floor(Date.now()/1000)-30*86400;bms=bms.filter(b=>b.date_added>c);}
      if (filter==='duplicates'){const h={};store.filter(b=>!b.is_deleted).forEach(b=>{h[b.url_hash]=(h[b.url_hash]||0)+1});bms=bms.filter(b=>h[b.url_hash]>1);}
      if (filter==='untagged') bms=bms.filter(b=>!b.tags||b.tags==='[]');
      const col=sortKey||'date_added'; const dir=sortDir==='asc'?1:-1;
      bms.sort((a,b)=>{const av=a[col]||'',bv=b[col]||'';return av<bv?-dir:av>bv?dir:0});
      return {rows:bms.slice(offset||0,(offset||0)+(limit||500)),total:bms.length};
    },
    getStats: async () => {
      const active=store.filter(b=>!b.is_deleted);
      const h={};active.forEach(b=>{h[b.url_hash]=(h[b.url_hash]||0)+1});
      const dupes=active.filter(b=>h[b.url_hash]>1).length;
      const browsers={};active.forEach(b=>{browsers[b.browser]=(browsers[b.browser]||0)+1});
      const folders={};active.forEach(b=>{if(b.folder_path)folders[b.folder_path]=(folders[b.folder_path]||0)+1});
      const topFolders=Object.entries(folders).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([name,count])=>({name,count}));
      const domains={};active.forEach(b=>{try{const d=new URL(b.url).hostname.replace('www.','');domains[d]=(domains[d]||0)+1}catch(_){}});
      const topDomains=Object.entries(domains).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([domain,count])=>({domain,count}));
      return {total:active.length,deleted:store.filter(b=>b.is_deleted).length,dupes,recent:active.filter(b=>b.date_added>Math.floor(Date.now()/1000)-30*86400).length,
        untagged:active.filter(b=>!b.tags||b.tags==='[]').length,
        browsers:Object.entries(browsers).map(([browser,count])=>({browser,count})),topFolders,topDomains};
    },
    deleteBookmarks: async ({ids}) => { const now=Math.floor(Date.now()/1000); ids.forEach(id=>{const b=store.find(x=>x.id===id);if(b){b.is_deleted=1;b.deleted_at=now;}}); return {success:true,count:ids.length}; },
    restoreBookmarks: async ({ids}) => { ids.forEach(id=>{const b=store.find(x=>x.id===id);if(b){b.is_deleted=0;b.deleted_at=0;}}); return {success:true,count:ids.length}; },
    purgeDeleted: async () => { const c=store.filter(b=>b.is_deleted).length; store=store.filter(b=>!b.is_deleted); return {success:true,count:c}; },
    deleteDuplicates: async () => { const seen={}; let c=0; store.filter(b=>!b.is_deleted).forEach(b=>{if(seen[b.url_hash]){b.is_deleted=1;b.deleted_at=Math.floor(Date.now()/1000);c++;}else seen[b.url_hash]=true;}); return {success:true,count:c}; },
    updateBookmark: async ({id,data}) => { const b=store.find(x=>x.id===id); if(b) Object.assign(b,data); return {success:true}; },
    likeBookmark: async ({id, liked}) => { const b=store.find(x=>x.id===id); if(b) b.is_liked = liked?1:0; return {success:true}; },
    addUrl: async ({url, title}) => {
      const trimmed = (url||'').trim();
      if (!trimmed.startsWith('http')) return {success:false, error:'Invalid URL'};
      const h = trimmed.split('').reduce((a,c)=>(a*31+c.charCodeAt(0))|0,0).toString(36);
      if (store.find(b=>b.url===trimmed&&b.browser==='user'&&!b.is_deleted)) return {success:false, duplicate:true};
      const bm = {id:store.length+1, title:title||trimmed, url:trimmed, browser:'user', url_hash:h, tags:'[]', date_added:Math.floor(Date.now()/1000), is_deleted:0, user_added:1, folder_path:''};
      store.push(bm); return {success:true, count:1};
    },
    hardDeleteUser: async ({ids}) => {
      const numIds = (ids||[]).map(Number);
      const before = store.length;
      store.splice(0, store.length, ...store.filter(b => !(numIds.includes(Number(b.id)) && b.browser==='user')));
      return {success:true, count:before-store.length};
    },
    addTag: async ({bookmarkIds,tagName}) => { bookmarkIds.forEach(id=>{const b=store.find(x=>x.id===id);if(b){const t=JSON.parse(b.tags||'[]');if(!t.includes(tagName)){t.push(tagName);b.tags=JSON.stringify(t);}}}); return {success:true}; },
    deleteTag: async ({tagName}) => { store.forEach(b=>{try{const t=JSON.parse(b.tags||'[]');const i=t.indexOf(tagName);if(i!==-1){t.splice(i,1);b.tags=JSON.stringify(t);}}catch(_){}}); return {success:true}; },
    getAllTags: async () => { const t={}; store.forEach(b=>{try{JSON.parse(b.tags||'[]').forEach(x=>{t[x]=(t[x]||0)+1});}catch(_){}}); return Object.entries(t).map(([name,count])=>({name,count})); },
    exportBookmarks: async ({ids}) => {
      const bms=ids?store.filter(b=>ids.includes(b.id)):store;
      const folders={};bms.forEach(b=>{const f=b.folder_path||'Unsorted';if(!folders[f])folders[f]=[];folders[f].push(b);});
      let html=`<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n`;
      Object.entries(folders).forEach(([f,items])=>{html+=`    <DT><H3>${f}</H3>\n    <DL><p>\n`;items.forEach(b=>{html+=`        <DT><A HREF="${b.url}" ADD_DATE="${b.date_added||0}">${b.title||''}</A>\n`;});html+=`    </DL><p>\n`;});
      html+=`</DL>`;
      const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));a.download='bookmarks-export.html';a.click();
      return {success:true,count:bms.length};
    },
    openUrl: async (url) => window.open(url,'_blank'),
    checkDeadLinks: async () => ({dead:[],alive:[]}),
    getSyncStatus: async () => ({watching:[],count:0}),
    forceSync: async () => ({success:true,added:0}),
    onBookmarksSynced: () => () => {},
    generateDemoData: async ({count}) => {
      const n=count||10000;
      const folders=['Development','Design','AI & ML','News','Shopping','Finance','Entertainment','Travel','Health','Tools','Work','Personal','Research','Tutorials','Videos','Photography','Music','Gaming','Science','Politics'];
      const browsers=['chrome','firefox','edge','brave','opera','zen','arc'];
      const domains=['github.com','stackoverflow.com','developer.mozilla.org','css-tricks.com','medium.com','dev.to','npmjs.com','reactjs.org','tailwindcss.com','figma.com','dribbble.com','producthunt.com','news.ycombinator.com','reddit.com','youtube.com','notion.so','vercel.com','netlify.com','openai.com','huggingface.co','arxiv.org','kaggle.com','coursera.org','udemy.com','wikipedia.org','stripe.com','linear.app','codepen.io'];
      const titles=['Getting Started','Documentation','Tutorial','Reference','Examples','API Docs','Blog Post','Case Study','Deep Dive','Guide','Comparison','Review','Introduction','Advanced Guide'];
      const now=Math.floor(Date.now()/1000);
      const bms=Array.from({length:n},(_,i)=>{const domain=domains[i%domains.length];const slug=Math.random().toString(36).slice(2,8);return {title:`${titles[i%titles.length]} — ${domain.split('.')[0]} ${slug}`,url:`https://${domain}/${folders[i%folders.length].toLowerCase().replace(/ /g,'-')}/${slug}`,folder_path:folders[i%folders.length],browser:browsers[i%browsers.length],date_added:now-Math.floor(Math.random()*365*86400),url_hash:sh(`${domain}/${slug}/${i}`),tags:'[]'};});
      return {success:true,count:ins(bms)};
    },
  };
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView]               = useState('list');
  const [sidebarFilter, setSidebarFilter] = useState({ type: 'all' });
  const [search, setSearch]           = useState('');
  const [sort, setSort]               = useState({ key: 'date_added', dir: 'desc' });
  const [selected, setSelected]       = useState(new Set());
  const [stats, setStats]             = useState(null);
  const [tags, setTags]               = useState([]);
  const [showImport, setShowImport]   = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(null);
  const [toasts, setToasts]           = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [scanning, setScanning]       = useState(false);
  const [syncEvents, setSyncEvents]   = useState([]);  // live sync notifications
  const [syncStatus, setSyncStatus]   = useState({ watching: [], count: 0 });

  // ── Bootstrap + live sync listener ─────────────────────────────────────────
  useEffect(() => {
    loadStats();
    loadTags();
  }, [refreshTick]);

  useEffect(() => {
    // Register live sync listener (Electron only)
    if (api.onBookmarksSynced) {
      const unsubscribe = api.onBookmarksSynced((data) => {
        // New bookmarks arrived from a browser
        const msg = `+${data.added} new from ${data.browser}`;
        setSyncEvents(ev => [{ id: Date.now(), ...data, msg }, ...ev.slice(0, 4)]);
        toast(`⟳ Auto-synced ${data.added} new bookmarks from ${data.browser}`, 'success');
        setRefreshTick(t => t + 1);
      });
      return unsubscribe;
    }
  }, []);

  useEffect(() => {
    // Poll sync status every 10s to show which files are being watched
    const poll = async () => {
      if (api.getSyncStatus) {
        const s = await api.getSyncStatus();
        setSyncStatus(s);
      }
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, []);

  const refresh = useCallback(() => setRefreshTick(t => t + 1), []);
  const refreshStats = useCallback(async () => { const s = await api.getStats(); setStats(s); }, []);

  const loadStats = refreshStats;
  const loadTags  = async () => { const t = await api.getAllTags(); setTags(t); };

  // ── Toast ──────────────────────────────────────────────────────────────────
  const toast = useCallback((msg, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(ts => [...ts, { id, msg, type }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 4000);
  }, []);

  // IMPORTANT: useMemo so queryParams object reference is stable unless actual
  // query params change. Without this, every state change (including selection)
  // creates a new object reference, causing BookmarkList to reload data.
  // Must be declared BEFORE any useCallback that references it.
  const queryParams = useMemo(() => ({
    search,
    browser: sidebarFilter.type === 'browser' ? sidebarFilter.value : undefined,
    folder:  sidebarFilter.type === 'folder'  ? sidebarFilter.value : undefined,
    tag:     sidebarFilter.type === 'tag'     ? sidebarFilter.value : undefined,
    filter:  ['all','browser','folder','tag'].includes(sidebarFilter.type) ? undefined : sidebarFilter.type,
    sortKey: sort.key,
    sortDir: sort.dir,
  }), [search, sidebarFilter, sort]);

  // ── Selection ─────────────────────────────────────────────────────────────
  const toggleSelect = useCallback((id) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const selectAll = useCallback(async () => {
    const result = await api.queryBookmarks({ ...queryParams, limit: 100000, offset: 0 });
    setSelected(new Set(result.rows.map(b => b.id)));
  }, [queryParams]);

  const deselectAll = useCallback(() => setSelected(new Set()), []);

  // ── Delete — soft-delete (moves to Deleted section) ──────────────────────
  const handleDelete = useCallback(async (ids) => {
    const idArr = ids || [...selected];
    if (!idArr.length) return;
    const result = await api.deleteBookmarks({ ids: idArr });
    if (result.success) {
      toast(`Moved ${result.count} bookmark${result.count !== 1 ? 's' : ''} to Deleted`, 'success');
      setSelected(prev => { const n = new Set(prev); idArr.forEach(id => n.delete(id)); return n; });
      refresh();
    }
  }, [selected, refresh, toast]);

  const handleRestore = useCallback(async (ids) => {
    const idArr = ids || [...selected];
    if (!idArr.length) return;
    const result = await api.restoreBookmarks({ ids: idArr });
    if (result.success) {
      toast(`Restored ${result.count} bookmark${result.count !== 1 ? 's' : ''}`, 'success');
      setSelected(prev => { const n = new Set(prev); idArr.forEach(id => n.delete(id)); return n; });
      refresh();
    }
  }, [selected, refresh, toast]);

  const handlePurgeDeleted = useCallback(async () => {
    if (!window.confirm('Permanently delete all items in the Deleted section? This cannot be undone.')) return;
    const result = await api.purgeDeleted();
    if (result.success) { toast(`Permanently deleted ${result.count} bookmarks`, 'success'); refresh(); }
  }, [refresh, toast]);

  const handleDeleteDupes = useCallback(async () => {
    const result = await api.deleteDuplicates();
    if (result.success) { toast(`Moved ${result.count} duplicates to Deleted`, 'success'); refresh(); }
  }, [refresh, toast]);

  const handleDeleteTag = useCallback(async (tagName) => {
    if (!window.confirm(`Delete tag "${tagName}" from all bookmarks? This cannot be undone.`)) return;
    const result = await api.deleteTag({ tagName });
    if (result.success) {
      toast(`Deleted tag "${tagName}"`, 'success');
      // If currently filtered by this tag, clear the filter
      if (sidebarFilter.type === 'tag' && sidebarFilter.value === tagName) {
        setSidebarFilter({ type: 'all' });
      }
      refresh();
    }
  }, [refresh, toast, sidebarFilter]);

  const handleExport = useCallback(async (ids) => {
    const result = await api.exportBookmarks({ ids: ids || (selected.size > 0 ? [...selected] : null) });
    if (result.success) toast(`Exported ${result.count} bookmarks`, 'success');
  }, [selected, toast]);

  const handleOpenUrl     = useCallback((url) => api.openUrl(url), []);

  // Range-select (Shift+click): add all IDs in range to selection
  const handleRangeSelect = useCallback(({ add, remove }) => {
    setSelected(prev => {
      const n = new Set(prev);
      (remove || []).forEach(id => n.delete(id));
      (add || []).forEach(id => n.add(id));
      return n;
    });
  }, []);

  // Paste URL: Ctrl+V anywhere in the app (not in inputs) → add as 'user' bookmark
  const handlePasteUrl = useCallback(async (url) => {
    const trimmed = url?.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      toast('Paste a valid URL (must start with http:// or https://)', 'warn');
      return;
    }
    const result = await api.addUrl({ url: trimmed });
    if (result?.success) {
      toast(`Added: ${trimmed}`, 'success');
      refresh();
    } else if (result?.duplicate) {
      toast('URL already in your bookmarks', 'warn');
    } else {
      toast(result?.error || 'Failed to add URL', 'warn');
    }
  }, [refresh, toast]);

  // Hard-delete user bookmarks permanently (only allowed for browser='user')
  const handleHardDeleteUser = useCallback(async (ids) => {
    const idArr = Array.isArray(ids) ? ids : [...selected];
    if (!idArr.length) return;
    if (!window.confirm(`Permanently delete ${idArr.length} bookmark${idArr.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    const result = await api.hardDeleteUser({ ids: idArr });
    if (result?.success) {
      toast(`Permanently deleted ${result.count} bookmark${result.count !== 1 ? 's' : ''}`, 'success');
      setSelected(prev => { const n = new Set(prev); idArr.forEach(id => n.delete(id)); return n; });
      refresh();
    }
  }, [selected, refresh, toast]);

  const handleLike = useCallback(async (id, liked) => {
    await api.likeBookmark({ id, liked });
    // Don't do a full refresh — row handles its own local state immediately.
    // Only refresh stats so the sidebar count updates.
    refreshStats();
  }, []);

  const handleTagSelected = useCallback(() => { if (selected.size === 0) { toast('Select bookmarks first', 'warn'); return; } setShowTagModal(true); }, [selected, toast]);

  const handleAddTag = useCallback(async (tagName, color) => {
    const result = await api.addTag({ bookmarkIds: [...selected], tagName, tagColor: color });
    if (result.success) { toast(`Tagged ${selected.size} bookmark${selected.size !== 1 ? 's' : ''} as "${tagName}"`, 'success'); refresh(); }
    setShowTagModal(false);
  }, [selected, refresh, toast]);

  const handleImportDone = useCallback((count) => {
    if (count > 0) toast(`Imported ${count.toLocaleString()} bookmarks`, 'success');
    refresh(); setShowImport(false);
  }, [refresh, toast]);

  const handleContextMenu = useCallback((e, bookmark) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, bookmark });
  }, []);

  const handleForceSync = useCallback(async () => {
    setScanning(true);
    toast('Syncing all browsers…', 'info');
    const result = await api.forceSync();
    setScanning(false);
    if (result.success) {
      toast(result.added > 0 ? `⟳ Synced +${result.added} new bookmarks` : '⟳ Already up to date', 'success');
      if (result.added > 0) refresh();
    }
  }, [refresh, toast]);

  const handleGenerateDemo = useCallback(async () => {
    setScanning(true);
    toast('Generating 10,000 demo bookmarks…', 'info');
    const result = await api.generateDemoData({ count: 10000 });
    setScanning(false);
    if (result.success) { toast(`✓ Loaded ${result.count.toLocaleString()} bookmarks`, 'success'); refresh(); }
  }, [refresh, toast]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = async (e) => {
      if ((e.ctrlKey||e.metaKey) && e.key==='a') { e.preventDefault(); selectAll(); }
      if ((e.ctrlKey||e.metaKey) && e.key==='f') { e.preventDefault(); document.getElementById('search-input')?.focus(); }
      if (e.key==='Escape') { deselectAll(); setContextMenu(null); }
      if (e.key==='Delete' && selected.size>0 && !e.target.matches('input,textarea')) handleDelete();
      // Ctrl+V outside of input fields → paste URL as new bookmark
      if ((e.ctrlKey||e.metaKey) && e.key==='v' && !e.target.matches('input,textarea,[contenteditable]')) {
        e.preventDefault();
        try {
          const text = await navigator.clipboard.readText();
          if (text?.trim().startsWith('http')) handlePasteUrl(text);
        } catch(_) {}
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectAll, deselectAll, handleDelete, handlePasteUrl, selected]);

  return (
    <div className={styles.root}>
      <Titlebar stats={stats} syncStatus={syncStatus} onForceSync={handleForceSync} scanning={scanning} />

      {/* Live sync notification banner */}
      {syncEvents.length > 0 && (
        <SyncBanner events={syncEvents} onDismiss={() => setSyncEvents([])} />
      )}

      <div className={styles.body}>
        <Sidebar
          stats={stats}
          tags={tags}
          activeFilter={sidebarFilter}
          onFilter={setSidebarFilter}
          onDeleteDupes={handleDeleteDupes}
          onImport={() => setShowImport(true)}
          onDemo={handleGenerateDemo}
          onForceSync={handleForceSync}
          scanning={scanning}
          syncStatus={syncStatus}
          onPurgeDeleted={handlePurgeDeleted}
          onDeleteTag={handleDeleteTag}
        />

        <div className={styles.main}>
          <Toolbar
            search={search}
            onSearch={setSearch}
            view={view}
            onView={setView}
            sort={sort}
            onSort={setSort}
            selected={selected}
            onSelectAll={selectAll}
            onDeselectAll={deselectAll}
            onDelete={() => handleDelete()}
            onRestore={() => handleRestore()}
            onExport={handleExport}
            onTag={handleTagSelected}
            onImport={() => setShowImport(true)}
            total={stats?.total || 0}
            isDeletedView={sidebarFilter.type === 'deleted'}
          />

          <BookmarkList
            queryParams={queryParams}
            view={view}
            selected={selected}
            onToggleSelect={toggleSelect}
            onRangeSelect={handleRangeSelect}
            onContextMenu={handleContextMenu}
            onOpenUrl={handleOpenUrl}
            onDelete={sidebarFilter.type === 'deleted'
              ? (id) => handleHardDeleteUser([id])
              : (id) => handleDelete([id])}
            onRestore={(id) => handleRestore([id])}
            onEdit={(bm) => setShowEditModal(bm)}
            onLike={handleLike}
            search={search}
            refreshTick={refreshTick}
            api={api}
            isDeletedView={sidebarFilter.type === 'deleted'}
          />
        </div>

        {view === 'analytics' && <AnalyticsPanel stats={stats} />}
      </div>

      <StatusBar stats={stats} selected={selected} sort={sort} filter={sidebarFilter} syncStatus={syncStatus} />

      {showImport && (
        <ImportModal api={api} onClose={() => setShowImport(false)} onDone={handleImportDone} onToast={toast} />
      )}
      {showTagModal && (
        <TagModal existingTags={tags} count={selected.size} onConfirm={handleAddTag} onClose={() => setShowTagModal(false)} />
      )}
      {showEditModal && (
        <EditModal bookmark={showEditModal} api={api} onClose={() => setShowEditModal(null)}
          onSaved={() => { setShowEditModal(null); refresh(); toast('Bookmark updated', 'success'); }} />
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y} bookmark={contextMenu.bookmark}
          isSelected={selected.has(contextMenu.bookmark?.id)}
          isDeletedView={sidebarFilter.type === 'deleted'}
          onClose={() => setContextMenu(null)}
          onOpen={() => handleOpenUrl(contextMenu.bookmark.url)}
          onCopyUrl={() => { navigator.clipboard.writeText(contextMenu.bookmark.url); toast('URL copied', 'success'); }}
          onCopyTitle={() => { navigator.clipboard.writeText(contextMenu.bookmark.title); toast('Title copied', 'success'); }}
          onSelect={() => toggleSelect(contextMenu.bookmark.id)}
          onEdit={() => { setShowEditModal(contextMenu.bookmark); setContextMenu(null); }}
          onDelete={() => { handleDelete([contextMenu.bookmark.id]); setContextMenu(null); }}
          onRestore={() => { handleRestore([contextMenu.bookmark.id]); setContextMenu(null); }}
          onTag={() => { toggleSelect(contextMenu.bookmark.id); setShowTagModal(true); setContextMenu(null); }}
        />
      )}

      <Toast toasts={toasts} />
    </div>
  );
}

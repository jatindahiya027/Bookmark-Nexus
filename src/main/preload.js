const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  scanBrowsers:     ()     => ipcRenderer.invoke('scan-browsers'),
  importBrowser:    (args) => ipcRenderer.invoke('import-browser', args),
  importHtmlFile:   (args) => ipcRenderer.invoke('import-html-file', args),
  openFileDialog:   (args) => ipcRenderer.invoke('open-file-dialog', args),
  queryBookmarks:   (p)    => ipcRenderer.invoke('query-bookmarks', p),
  getStats:         ()     => ipcRenderer.invoke('get-stats'),
  deleteBookmarks:  (args) => ipcRenderer.invoke('delete-bookmarks', args),
  deleteDuplicates: ()     => ipcRenderer.invoke('delete-duplicates'),
  updateBookmark:   (args) => ipcRenderer.invoke('update-bookmark', args),
  likeBookmark:     (args) => ipcRenderer.invoke('like-bookmark', args),
  addUrl:           (args) => ipcRenderer.invoke('add-url', args),
  hardDeleteUser:   (args) => ipcRenderer.invoke('hard-delete-user', args),
  addTag:           (args) => ipcRenderer.invoke('add-tag', args),
  deleteTag:        (args) => ipcRenderer.invoke('delete-tag', args),
  getAllTags:        ()     => ipcRenderer.invoke('get-all-tags'),
  exportBookmarks:  (args) => ipcRenderer.invoke('export-bookmarks', args),
  openUrl:          (url)  => ipcRenderer.invoke('open-url', url),
  checkDeadLinks:   (args) => ipcRenderer.invoke('check-dead-links', args),
  generateDemoData: (args) => ipcRenderer.invoke('generate-demo-data', args),
  restoreBookmarks: (args) => ipcRenderer.invoke('restore-bookmarks', args),
  purgeDeleted:     ()     => ipcRenderer.invoke('purge-deleted'),
  getSyncStatus:    ()     => ipcRenderer.invoke('get-sync-status'),
  forceSync:        ()     => ipcRenderer.invoke('force-sync'),

  // Live sync event from main process → renderer
  onBookmarksSynced: (cb) => {
    ipcRenderer.on('bookmarks-synced', (_, data) => cb(data));
    return () => ipcRenderer.removeAllListeners('bookmarks-synced');
  },
});

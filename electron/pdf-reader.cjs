const { app, BrowserWindow, WebContentsView, ipcMain, dialog, Menu } = require('electron');
const fs = require('node:fs/promises');
const { rmSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');

function pdfBytes(value) {
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value && Array.isArray(value.data)) return Buffer.from(value.data);
  throw new Error('Invalid PDF data');
}

function pdfFileName(value) {
  let name = path.basename(String(value || 'document.pdf')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
  name = name.slice(0, 160).replace(/[. ]+$/, '') || 'document';
  if (!/\.pdf$/i.test(name)) name += '.pdf';
  // Windows device names are reserved even with a file extension.
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(name)) name = `_${name}`;
  return name;
}

async function registerPdfReader() {
  // Chromium reads an ordinary local PDF. These are isolated snapshots so
  // native save/annotation actions cannot change a library original.
  const temporaryRoot = await fs.mkdtemp(path.join(app.getPath('temp'), 'silvergrain-pdf-'));
  const sessions = new Map();
  const currentByOwner = new Map();
  const channels = [];
  const label = (entry, zh, en) => entry.language === 'en' ? en : zh;

  function notify(entry, channel, payload) {
    if (!entry.owner.isDestroyed()) entry.owner.send(channel, { sessionId: entry.id, ...payload });
  }

  function destroyEntry(entry) {
    if (!entry || !sessions.delete(entry.id)) return;
    if (currentByOwner.get(entry.owner.id) === entry) currentByOwner.delete(entry.owner.id);
    entry.owner.removeListener('destroyed', entry.onOwnerDestroyed);
    entry.owner.removeListener('did-start-navigation', entry.onOwnerNavigation);
    entry.window.removeListener('resize', entry.onResize);
    if (entry.view) {
      if (!entry.window.isDestroyed()) entry.window.contentView.removeChildView(entry.view);
      if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close();
    }
    // Only remove a direct child of the directory created for this process.
    if (path.dirname(entry.directory) === temporaryRoot) entry.cleanup = fs.rm(entry.directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }).catch(() => {});
  }

  function ownedSession(event, id) {
    const entry = sessions.get(id);
    if (!entry || entry.owner !== event.sender || event.senderFrame !== event.sender.mainFrame) throw new Error('PDF reader session is closed');
    return entry;
  }

  function applyBounds(entry, bounds, updateMargins = true) {
    if (!entry.view || entry.window.isDestroyed()) return;
    const [width, height] = entry.window.getContentSize();
    const scale = entry.owner.getZoomFactor();
    const value = key => Number.isFinite(bounds?.[key]) ? bounds[key] * scale : 0;
    const x = Math.max(0, Math.min(width, Math.round(value('x'))));
    const y = Math.max(0, Math.min(height, Math.round(value('y'))));
    const next = { x, y, width: Math.max(0, Math.min(width - x, Math.round(value('width')))), height: Math.max(0, Math.min(height - y, Math.round(value('height')))) };
    entry.view.setBounds(next);
    entry.view.setVisible(next.width > 0 && next.height > 0);
    if (updateMargins) entry.margins = { left: x, top: y, right: width - x - next.width, bottom: height - y - next.height };
  }

  async function exportEntry(entry) {
    const result = await dialog.showSaveDialog(entry.window, {
      title: label(entry, '导出 PDF', 'Export PDF'),
      defaultPath: path.join(app.getPath('downloads'), entry.fileName),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return null;
    await fs.copyFile(entry.filePath, result.filePath);
    return result.filePath;
  }

  function handle(channel, action) {
    ipcMain.handle(channel, action);
    channels.push(channel);
  }

  handle('pdf-reader:open', async (event, options) => {
    const owner = event.sender;
    const window = BrowserWindow.fromWebContents(owner);
    if (!window || event.senderFrame !== owner.mainFrame) throw new Error('Invalid PDF reader owner');
    const bytes = pdfBytes(options?.bytes);
    if (!bytes.byteLength || !bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('Invalid PDF file');
    destroyEntry(currentByOwner.get(owner.id));
    const id = randomUUID();
    const directory = path.join(temporaryRoot, id);
    const fileName = pdfFileName(options.fileName);
    const entry = {
      id, owner, window, directory, fileName, filePath: path.join(directory, fileName),
      language: options.language === 'en' ? 'en' : 'zh', view: null, query: '', margins: null,
    };
    entry.onOwnerDestroyed = () => destroyEntry(entry);
    entry.onOwnerNavigation = (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) destroyEntry(entry); };
    entry.onResize = () => {
      if (!entry.margins || !entry.view || window.isDestroyed()) return;
      const [width, height] = window.getContentSize();
      const m = entry.margins;
      const scale = owner.getZoomFactor();
      applyBounds(entry, { x: m.left / scale, y: m.top / scale, width: (width - m.left - m.right) / scale, height: (height - m.top - m.bottom) / scale }, false);
    };
    sessions.set(id, entry);
    currentByOwner.set(owner.id, entry);
    owner.once('destroyed', entry.onOwnerDestroyed);
    owner.on('did-start-navigation', entry.onOwnerNavigation);
    window.on('resize', entry.onResize);
    try {
      await fs.mkdir(directory);
      await fs.writeFile(entry.filePath, bytes);
      if (currentByOwner.get(owner.id) !== entry || owner.isDestroyed()) throw new Error('PDF reader session superseded');
      const view = new WebContentsView({ webPreferences: {
        plugins: true, sandbox: true, contextIsolation: true, nodeIntegration: false,
      } });
      entry.view = view;
      view.setBackgroundColor('#282828');
      window.contentView.addChildView(view);
      applyBounds(entry, options.bounds);
      const contents = view.webContents;
      contents.setWindowOpenHandler(() => ({ action: 'deny' }));
      const fileUrl = pathToFileURL(entry.filePath).href;
      contents.on('will-navigate', (navigation, url) => { if (url.split('#')[0] !== fileUrl) navigation.preventDefault(); });
      contents.on('found-in-page', (_event, result) => notify(entry, 'pdf-reader:search-result', { query: entry.query, ...result }));
      contents.on('render-process-gone', () => notify(entry, 'pdf-reader:command', { command: 'error' }));
      contents.on('before-input-event', (inputEvent, input) => {
        if (input.type !== 'keyDown') return;
        if ((input.control || input.meta) && !input.alt && input.key.toLowerCase() === 'f') {
          inputEvent.preventDefault();
          owner.focus();
          notify(entry, 'pdf-reader:command', { command: 'search' });
        } else if ((input.control || input.meta) && !input.alt && input.key.toLowerCase() === 's') {
          inputEvent.preventDefault();
          exportEntry(entry).catch(() => notify(entry, 'pdf-reader:command', { command: 'export-error' }));
        } else if (input.key === 'Escape') {
          inputEvent.preventDefault();
          notify(entry, 'pdf-reader:command', { command: 'close' });
        }
      });
      contents.on('context-menu', (_event, params) => {
        Menu.buildFromTemplate([
          { role: 'copy', label: label(entry, '复制', 'Copy'), enabled: !!params.selectionText },
          { role: 'selectAll', label: label(entry, '全选', 'Select all') },
          { type: 'separator' },
          { label: label(entry, '导出 PDF', 'Export PDF'), click: () => { exportEntry(entry).catch(() => {}); } },
        ]).popup({ window });
      });
      await contents.loadFile(entry.filePath);
      if (currentByOwner.get(owner.id) !== entry) throw new Error('PDF reader session superseded');
      return { sessionId: id };
    } catch (error) {
      destroyEntry(entry);
      throw error;
    }
  });
  handle('pdf-reader:bounds', (event, id, bounds) => applyBounds(ownedSession(event, id), bounds));
  handle('pdf-reader:close', (event, id) => {
    const entry = sessions.get(id);
    if (entry && entry.owner === event.sender) destroyEntry(entry);
  });
  handle('pdf-reader:find', (event, id, query, options = {}) => {
    const entry = ownedSession(event, id);
    entry.query = String(query).slice(0, 1000);
    if (!entry.query) {
      entry.view.webContents.stopFindInPage('clearSelection');
      return null;
    }
    return entry.view.webContents.findInPage(entry.query, { forward: options.forward !== false, findNext: options.findNext === true });
  });
  handle('pdf-reader:export', (event, id) => exportEntry(ownedSession(event, id)));
  const onQuit = () => {
    for (const entry of [...sessions.values()]) destroyEntry(entry);
    // This root is a fresh mkdtemp directory containing only our snapshots.
    try { rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* Windows may briefly retain a native plugin file handle. */ }
  };
  app.once('before-quit', onQuit);
  return {
    // Kept in the main process for integration checks; never exposed to pages.
    getSession: ownerId => currentByOwner.get(ownerId),
    async dispose() {
      app.removeListener('before-quit', onQuit);
      for (const channel of channels) ipcMain.removeHandler(channel);
      for (const entry of [...sessions.values()]) destroyEntry(entry);
      await fs.rm(temporaryRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
    },
  };
}

module.exports = { registerPdfReader };

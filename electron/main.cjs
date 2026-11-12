const { app, BrowserWindow, dialog, ipcMain, protocol, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { registerPdfReader } = require('./pdf-reader.cjs');

protocol.registerSchemesAsPrivileged([{
  scheme: 'library',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

let storePath;
let filesPath;
let brandFilesPath;
let equipmentFilesPath;
let industryFilesPath;
const equipmentCategories = ['相机资料', '镜头资料', '维修手册', '滤镜', '其他配件'];
const filmStatuses = ['在产', '已停产', '待核实'];

async function readStore() {
  try {
    const documents = JSON.parse(await fs.readFile(storePath, 'utf8'));
    return documents.map((document) => ['行业标准', '行业资料'].includes(document.category) ? { ...document, category: '技术文档' } : document);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return [];
  }
}

async function writeStore(documents) {
  const temporaryPath = `${storePath}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(documents, null, 2), 'utf8');
  await fs.rename(temporaryPath, storePath);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#f5f6f4',
    title: '银盐图书馆',
    icon: path.join(app.getAppPath(), 'build', 'silvergrain-app.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (!app.isPackaged) {
    window.loadURL('http://127.0.0.1:5173');
  } else {
    window.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  const libraryPath = path.join(app.getPath('userData'), 'library');
  storePath = path.join(libraryPath, 'catalog.json');
  filesPath = path.join(libraryPath, 'pdfs');
  brandFilesPath = path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'film-library', 'brands');
  equipmentFilesPath = path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'film-library', 'equipment');
  industryFilesPath = path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'film-library', 'industry');
  const pdfAssetsPath = path.join(app.getAppPath(), 'dist', 'pdfjs');
  await fs.mkdir(filesPath, { recursive: true });

  protocol.handle('library', async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'pdfjs') return new Response(null, { status: 404 });
    let relativePath;
    try {
      relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    } catch {
      return new Response(null, { status: 400 });
    }
    if (!/^(cmaps|standard_fonts)\/[\w.-]+$/.test(relativePath)) return new Response(null, { status: 404 });
    const filePath = path.resolve(pdfAssetsPath, relativePath);
    const relative = path.relative(pdfAssetsPath, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return new Response(null, { status: 403 });
    try {
      return new Response(await fs.readFile(filePath), {
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/octet-stream' },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });

  ipcMain.handle('documents:list', readStore);
  ipcMain.handle('brands:list', async () => {
    const brands = [];
    const brandEntries = await fs.readdir(brandFilesPath, { withFileTypes: true }).catch(() => []);
    for (const brandEntry of brandEntries.filter((entry) => entry.isDirectory())) {
      const brandPath = path.join(brandFilesPath, brandEntry.name);
      const groups = { staticFilms: [], movieFilms: [] };
      for (const collection of ['静态摄影胶片', '电影卷']) {
        const collectionPath = collection === '电影卷' ? path.join(brandPath, '电影卷') : brandPath;
        const collectionFiles = [];
        for (const status of filmStatuses) {
          const statusPath = path.join(collectionPath, status);
          const files = await fs.readdir(statusPath, { withFileTypes: true }).catch(() => []);
          const fileRecords = await Promise.all(files
            .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.pdf')
            .map(async (entry) => {
              const filePath = path.join(statusPath, entry.name);
              const stat = await fs.stat(filePath);
              return { fileName: entry.name, fileSize: stat.size, status, collection };
            }));
          collectionFiles.push(...fileRecords);
        }
        if (collection === '电影卷') groups.movieFilms = collectionFiles;
        else groups.staticFilms = collectionFiles;
      }
      const count = groups.staticFilms.length + groups.movieFilms.length;
      if (count) brands.push({ name: brandEntry.name, count, ...groups });
    }
    return brands.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  });
  ipcMain.handle('brands:read-pdf', async (_event, brand, collection, status, fileName) => {
    if (!['静态摄影胶片', '电影卷'].includes(collection) || !filmStatuses.includes(status) || path.basename(fileName) !== fileName || path.extname(fileName).toLowerCase() !== '.pdf') {
      throw new Error('无效的品牌资料路径');
    }
    const brandRoot = path.resolve(brandFilesPath, brand);
    const collectionRoot = collection === '电影卷' ? path.resolve(brandRoot, '电影卷') : brandRoot;
    const filePath = path.resolve(collectionRoot, status, fileName);
    if (!brandRoot.startsWith(`${path.resolve(brandFilesPath)}${path.sep}`) || !filePath.startsWith(`${brandRoot}${path.sep}`)) {
      throw new Error('无效的品牌资料路径');
    }
    return fs.readFile(filePath);
  });
  ipcMain.handle('equipment:list-brands', async () => {
    const brands = [];
    const entries = await fs.readdir(equipmentFilesPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.filter((item) => item.isDirectory())) {
      const brandPath = path.join(equipmentFilesPath, entry.name);
      const categories = Object.fromEntries(equipmentCategories.map((category) => [category, []]));
      for (const category of equipmentCategories) {
        const categoryPath = path.join(brandPath, category);
        const files = await fs.readdir(categoryPath, { withFileTypes: true }).catch(() => []);
        const records = await Promise.all(files
          .filter((file) => file.isFile() && path.extname(file.name).toLowerCase() === '.pdf')
          .map(async (file) => ({
            fileName: file.name,
            fileSize: (await fs.stat(path.join(categoryPath, file.name))).size,
          })));
        categories[category] = records;
      }
      const count = Object.values(categories).reduce((total, files) => total + files.length, 0);
      if (count) brands.push({ name: entry.name, count, categories });
    }
    return brands.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  });
  ipcMain.handle('equipment:read-pdf', async (_event, brand, category, fileName) => {
    if (!equipmentCategories.includes(category) || path.basename(fileName) !== fileName || path.extname(fileName).toLowerCase() !== '.pdf') {
      throw new Error('无效的器材资料路径');
    }
    const root = path.resolve(equipmentFilesPath);
    const brandRoot = path.resolve(root, brand);
    const filePath = path.resolve(brandRoot, category, fileName);
    if (!brandRoot.startsWith(`${root}${path.sep}`) || !filePath.startsWith(`${brandRoot}${path.sep}`)) {
      throw new Error('无效的器材资料路径');
    }
    return fs.readFile(filePath);
  });
  ipcMain.handle('industry:list-groups', async () => {
    const entries = await fs.readdir(industryFilesPath, { withFileTypes: true }).catch(() => []);
    const groups = [];
    for (const entry of entries.filter((item) => item.isDirectory())) {
      const groupPath = path.join(industryFilesPath, entry.name);
      const readRecords = async (directory) => {
        const files = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
        const records = await Promise.all(files
          .filter((file) => file.isFile() && path.extname(file.name).toLowerCase() === '.pdf')
          .map(async (file) => ({ fileName: file.name, fileSize: (await fs.stat(path.join(directory, file.name))).size })));
        return records.sort((left, right) => left.fileName.localeCompare(right.fileName, 'zh-CN'));
      };
      if (entry.name === '冲洗工艺') {
        const subEntries = await fs.readdir(groupPath, { withFileTypes: true }).catch(() => []);
        for (const subEntry of subEntries.filter((item) => item.isDirectory())) {
          const subPath = path.join(groupPath, subEntry.name);
          const records = await readRecords(subPath);
          if (records.length) groups.push({ name: subEntry.name, path: path.join(entry.name, subEntry.name), files: records });
        }
        const directRecords = await readRecords(groupPath);
        if (directRecords.length) groups.push({ name: entry.name, path: entry.name, files: directRecords });
      } else {
        const records = await readRecords(groupPath);
        if (records.length) groups.push({ name: entry.name, path: entry.name, files: records });
      }
    }
    return groups.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  });
  ipcMain.handle('industry:read-pdf', async (_event, group, fileName) => {
    if (typeof group !== 'string' || path.isAbsolute(group) || path.basename(fileName) !== fileName || path.extname(fileName).toLowerCase() !== '.pdf') {
      throw new Error('无效的行业资料路径');
    }
    const root = path.resolve(industryFilesPath);
    const groupRoot = path.resolve(root, group);
    const filePath = path.resolve(groupRoot, fileName);
    const relativeGroup = path.relative(root, groupRoot);
    if (!relativeGroup || relativeGroup.startsWith('..') || path.isAbsolute(relativeGroup) || !filePath.startsWith(`${groupRoot}${path.sep}`)) throw new Error('无效的行业资料路径');
    return fs.readFile(filePath);
  });
  ipcMain.handle('documents:import', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入资料 PDF',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
    });
    if (result.canceled) return [];

    const documents = await readStore();
    const imported = [];
    for (const sourcePath of result.filePaths) {
      const id = randomUUID();
      const fileName = `${id}.pdf`;
      const destinationPath = path.join(filesPath, fileName);
      const stat = await fs.stat(sourcePath);
      await fs.copyFile(sourcePath, destinationPath);
      const document = {
        id,
        title: path.basename(sourcePath, path.extname(sourcePath)),
        category: '技术文档',
        kind: 'PDF',
        fileName: path.basename(sourcePath),
        storedFile: fileName,
        fileSize: stat.size,
        addedAt: new Date().toISOString(),
        tags: [],
        notes: '',
        text: '',
        status: '待提取',
        relatedIds: [],
      };
      documents.unshift(document);
      imported.push(document);
    }
    await writeStore(documents);
    return imported;
  });
  ipcMain.handle('documents:add-link', async (_event, link) => {
    const parsed = new URL(link.url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('仅支持 HTTP 或 HTTPS 链接');
    const document = {
      id: randomUUID(),
      title: String(link.title || parsed.hostname).slice(0, 200),
      category: link.category,
      kind: 'LINK',
      url: parsed.toString(),
      addedAt: new Date().toISOString(),
      tags: Array.isArray(link.tags) ? link.tags : [],
      notes: '',
      text: '',
      status: '链接',
      relatedIds: [],
    };
    const documents = await readStore();
    documents.unshift(document);
    await writeStore(documents);
    return document;
  });
  ipcMain.handle('documents:save', async (_event, patch) => {
    const documents = await readStore();
    const index = documents.findIndex((document) => document.id === patch.id);
    if (index < 0) throw new Error('找不到这条资料记录');
    documents[index] = { ...documents[index], ...patch, updatedAt: new Date().toISOString() };
    await writeStore(documents);
    return documents[index];
  });
  ipcMain.handle('documents:read-pdf', async (_event, id) => {
    const document = (await readStore()).find((item) => item.id === id);
    if (!document) throw new Error('找不到这条资料记录');
    return fs.readFile(path.join(filesPath, document.storedFile));
  });
  ipcMain.handle('documents:export-pdf', async (_event, bytes, suggestedName) => {
    const rawBytes = bytes instanceof Uint8Array
      ? bytes
      : bytes instanceof ArrayBuffer
        ? new Uint8Array(bytes)
        : bytes && Array.isArray(bytes.data)
          ? Uint8Array.from(bytes.data)
          : null;
    if (!rawBytes || !rawBytes.byteLength) throw new Error('无效的 PDF 数据');
    let fileName = path.basename(String(suggestedName || 'export.pdf'));
    fileName = fileName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'export.pdf';
    if (!/\.pdf$/i.test(fileName)) fileName += '.pdf';
    const result = await dialog.showSaveDialog({
      title: '导出 PDF',
      defaultPath: path.join(app.getPath('downloads'), fileName),
      filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, Buffer.from(rawBytes));
    return result.filePath;
  });
  ipcMain.handle('documents:delete', async (_event, id) => {
    const documents = await readStore();
    const document = documents.find((item) => item.id === id);
    if (!document) return false;
    await fs.rm(path.join(filesPath, document.storedFile), { force: true });
    await writeStore(documents.filter((item) => item.id !== id));
    return true;
  });
  ipcMain.handle('documents:open-link', async (_event, url) => {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('仅支持 HTTP 或 HTTPS 链接');
    await shell.openExternal(parsed.toString());
  });

  await registerPdfReader();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

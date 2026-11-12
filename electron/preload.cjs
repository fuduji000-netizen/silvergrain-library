const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('library', {
  list: () => ipcRenderer.invoke('documents:list'),
  listBrands: () => ipcRenderer.invoke('brands:list'),
  readBrandPdf: (brand, collection, status, fileName) => ipcRenderer.invoke('brands:read-pdf', brand, collection, status, fileName),
  listEquipmentBrands: () => ipcRenderer.invoke('equipment:list-brands'),
  readEquipmentPdf: (brand, category, fileName) => ipcRenderer.invoke('equipment:read-pdf', brand, category, fileName),
  listIndustryGroups: () => ipcRenderer.invoke('industry:list-groups'),
  readIndustryPdf: (group, fileName) => ipcRenderer.invoke('industry:read-pdf', group, fileName),
  importPdfs: () => ipcRenderer.invoke('documents:import'),
  addLink: (link) => ipcRenderer.invoke('documents:add-link', link),
  save: (document) => ipcRenderer.invoke('documents:save', document),
  readPdf: (id) => ipcRenderer.invoke('documents:read-pdf', id),
  exportPdf: (bytes, suggestedName) => ipcRenderer.invoke('documents:export-pdf', bytes, suggestedName),
  openPdfReader: (options) => ipcRenderer.invoke('pdf-reader:open', options),
  setPdfReaderBounds: (id, bounds) => ipcRenderer.invoke('pdf-reader:bounds', id, bounds),
  closePdfReader: (id) => ipcRenderer.invoke('pdf-reader:close', id),
  findPdfReader: (id, query, options) => ipcRenderer.invoke('pdf-reader:find', id, query, options),
  exportPdfReader: (id) => ipcRenderer.invoke('pdf-reader:export', id),
  onPdfReaderSearch: (callback) => {
    const listener = (_event, result) => callback(result);
    ipcRenderer.on('pdf-reader:search-result', listener);
    return () => ipcRenderer.removeListener('pdf-reader:search-result', listener);
  },
  onPdfReaderCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('pdf-reader:command', listener);
    return () => ipcRenderer.removeListener('pdf-reader:command', listener);
  },
  remove: (id) => ipcRenderer.invoke('documents:delete', id),
  openLink: (url) => ipcRenderer.invoke('documents:open-link', url),
});

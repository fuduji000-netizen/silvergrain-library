export const categories = ['全部资料', '技术文档', '冲洗工艺', '感光材料', '相机资料', '其他'] as const;
export type Category = (typeof categories)[number];

export const filmStatuses = ['在产', '已停产', '待核实'] as const;
export type FilmStatus = (typeof filmStatuses)[number];
export type FilmCollection = '静态摄影胶片' | '电影卷';
export const equipmentCategories = ['相机资料', '镜头资料', '维修手册', '滤镜', '其他配件'] as const;
export type EquipmentCategory = (typeof equipmentCategories)[number];

export interface FilmFile {
  fileName: string;
  fileSize: number;
  status: FilmStatus;
  collection: FilmCollection;
}

export interface FilmBrand {
  name: string;
  count: number;
  staticFilms: FilmFile[];
  movieFilms: FilmFile[];
}

export interface EquipmentFile {
  fileName: string;
  fileSize: number;
}

export interface EquipmentBrand {
  name: string;
  count: number;
  categories: Record<EquipmentCategory, EquipmentFile[]>;
}

export interface IndustryDocument {
  fileName: string;
  fileSize: number;
}

export interface IndustryGroup {
  name: string;
  path?: string;
  files: IndustryDocument[];
}

export interface LibraryDocument {
  id: string;
  title: string;
  category: Category;
  kind: 'PDF' | 'LINK';
  fileName?: string;
  storedFile?: string;
  fileSize?: number;
  url?: string;
  addedAt: string;
  updatedAt?: string;
  tags: string[];
  notes: string;
  text: string;
  status: '待提取' | '已索引' | '扫描件' | '链接';
  relatedIds: string[];
}

export interface LibraryBridge {
  list: () => Promise<LibraryDocument[]>;
  listBrands: () => Promise<FilmBrand[]>;
  readBrandPdf: (brand: string, collection: FilmCollection, status: FilmStatus, fileName: string) => Promise<Uint8Array | ArrayBuffer | { type: 'Buffer'; data: number[] }>;
  listEquipmentBrands: () => Promise<EquipmentBrand[]>;
  readEquipmentPdf: (brand: string, category: EquipmentCategory, fileName: string) => Promise<Uint8Array | ArrayBuffer | { type: 'Buffer'; data: number[] }>;
  listIndustryGroups: () => Promise<IndustryGroup[]>;
  readIndustryPdf: (group: string, fileName: string) => Promise<Uint8Array | ArrayBuffer | { type: 'Buffer'; data: number[] }>;
  importPdfs: () => Promise<LibraryDocument[]>;
  addLink: (link: { title: string; url: string; category: Category; tags: string[] }) => Promise<LibraryDocument>;
  save: (document: Partial<LibraryDocument> & Pick<LibraryDocument, 'id'>) => Promise<LibraryDocument>;
  readPdf: (id: string) => Promise<Uint8Array | ArrayBuffer | { type: 'Buffer'; data: number[] }>;
  exportPdf: (bytes: Uint8Array | ArrayBuffer | { type: 'Buffer'; data: number[] }, suggestedName?: string) => Promise<string | null>;
  openPdfReader: (options: { bytes: Uint8Array | ArrayBuffer | { type: 'Buffer'; data: number[] }; fileName: string; language: 'zh' | 'en'; bounds: PdfReaderBounds }) => Promise<{ sessionId: string }>;
  setPdfReaderBounds: (id: string, bounds: PdfReaderBounds) => Promise<void>;
  closePdfReader: (id: string) => Promise<void>;
  findPdfReader: (id: string, query: string, options?: { forward?: boolean; findNext?: boolean }) => Promise<number | null>;
  exportPdfReader: (id: string) => Promise<string | null>;
  onPdfReaderSearch: (callback: (result: PdfReaderSearchResult) => void) => () => void;
  onPdfReaderCommand: (callback: (event: { sessionId: string; command: 'search' | 'close' | 'error' | 'export-error' }) => void) => () => void;
  remove: (id: string) => Promise<boolean>;
  openLink: (url: string) => Promise<void>;
}

export interface PdfReaderBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfReaderSearchResult {
  sessionId: string;
  query: string;
  requestId: number;
  matches: number;
  activeMatchOrdinal: number;
  finalUpdate: boolean;
}

declare global {
  interface Window {
    library: LibraryBridge;
  }
}

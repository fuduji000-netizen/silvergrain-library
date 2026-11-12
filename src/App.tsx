import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Aperture, Archive, ArrowDownUp, ArrowRight, BookOpen, Camera,
  Check, ChevronDown, ChevronLeft, ChevronRight, FileText, Film,
  Filter, FolderOpen, Languages, Link2, LoaderCircle, MoreHorizontal,
  Plus, Search, SlidersHorizontal, Sparkles, Tag, Trash2,
  X,
} from 'lucide-react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { categories, equipmentCategories, filmStatuses, type Category, type EquipmentBrand, type EquipmentCategory, type EquipmentFile, type FilmBrand, type FilmCollection, type FilmFile, type FilmStatus, type IndustryGroup, type IndustryDocument, type LibraryDocument } from './types';
import cameraIconImage from './assets/leica-m6-ttl-front-pixel-text.png';
import filmIconImage from './assets/kodak-portra-160.png';
import technicalIconImage from './assets/technical-document-icon.png';
import processingIconImage from './assets/film-processing-icon.png';
import otherIconImage from './assets/other-materials-icon.png';
import allMaterialsIconImage from './assets/all-materials-icon.png';
import appIconImage from './assets/silvergrain-app-icon.png';
import { brandPreviewFiles, filmTitle } from './filmLibrary';
import { NativePdfViewer } from './NativePdfViewer';
import reviewedDocumentTitles from './documentTitles.json';
import { PageMemoryProvider, useDisclosureMemory, usePageScroll, useSectionDisclosure } from './pageMemory';

GlobalWorkerOptions.workerSrc = pdfWorker;

function loadPdf(bytes: Uint8Array) {
  return getDocument({
    data: bytes,
    cMapUrl: 'library://pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'library://pdfjs/standard_fonts/',
    useSystemFonts: true,
  }).promise;
}

const categoriesIcon: Record<Category, typeof BookOpen> = {
  '全部资料': Archive,
  '技术文档': FileText,
  '冲洗工艺': SlidersHorizontal,
  '感光材料': Sparkles,
  '相机资料': Camera,
  '其他': FolderOpen,
};

const categoryImages: Partial<Record<Category, string>> = {
  '全部资料': allMaterialsIconImage,
  '技术文档': technicalIconImage,
  '冲洗工艺': processingIconImage,
  '其他': otherIconImage,
};
const processingGroupOrder = ['B&W', 'C41', 'E6', 'ECN-2', '放大彩扩', '其他'] as const;
const processingGroupNames = new Set<string>([...processingGroupOrder, '相纸']);

function orderedProcessingGroups(groups: IndustryGroup[]): IndustryGroup[] {
  return processingGroupOrder.flatMap(name => {
    // Keep the existing paper directory as its PDF source while displaying
    // the requested printing category. Empty categories retain their place.
    const matches = groups.filter(group => (group.name === '相纸' ? '放大彩扩' : group.name) === name);
    return matches.length ? matches : [{ name, path: `冲洗工艺/${name}`, files: [] }];
  });
}

type AppLanguage = 'zh' | 'en';

const LanguageContext = createContext<AppLanguage>('zh');
const useAppLanguage = () => useContext(LanguageContext);
const localize = (language: AppLanguage, zh: string, en: string) => language === 'zh' ? zh : en;

const categoryLabels: Record<AppLanguage, Record<Category, string>> = {
  zh: {
    '全部资料': '全部资料',
    '技术文档': '技术文档',
    '冲洗工艺': '冲洗工艺',
    '感光材料': '感光材料',
    '相机资料': '相机资料',
    '其他': '其他',
  },
  en: {
    '全部资料': 'All materials',
    '技术文档': 'Technical',
    '冲洗工艺': 'Processing',
    '感光材料': 'Film',
    '相机资料': 'Cameras',
    '其他': 'Other',
  },
};

function categoryLabel(category: Category, language: AppLanguage) {
  return categoryLabels[language][category];
}

function statusLabel(status: FilmStatus, language: AppLanguage) {
  return language === 'zh' ? status : ({ '在产': 'Current', '已停产': 'Discontinued', '待核实': 'Status unconfirmed' } as Record<FilmStatus, string>)[status];
}

function documentStatusLabel(status: LibraryDocument['status'], language: AppLanguage) {
  if (language === 'zh') return status;
  return ({ '待提取': 'Pending extraction', '已索引': 'Indexed', '扫描件': 'Scanned', '链接': 'Link' } as Record<LibraryDocument['status'], string>)[status];
}

function collectionLabel(collection: FilmCollection, language: AppLanguage) {
  return language === 'zh' ? collection : collection === '电影卷' ? 'Motion picture film' : 'Still photography film';
}

function equipmentCategoryLabel(category: EquipmentCategory, language: AppLanguage) {
  if (language === 'zh') return category;
  return ({ '相机资料': 'Camera manuals', '镜头资料': 'Lens manuals', '维修手册': 'Service manuals', '滤镜': 'Filters', '其他配件': 'Other accessories' } as Record<EquipmentCategory, string>)[category];
}

function industryGroupLabel(group: string, language: AppLanguage) {
  if (language === 'zh') return group === '相纸' ? '放大彩扩' : group;
  return ({
    'C41': 'C-41', 'E6': 'E-6', 'B&W': 'B&W', 'ECN-2': 'ECN-2', '相纸': 'Printing', '放大彩扩': 'Printing', '其他': 'Other',
    '感光材料与影像': 'Photosensitive materials & imaging', '其他资料': 'Other references',
    '暗房设备': 'Darkroom equipment', '电影制作': 'Motion picture production', '行业标准与规范': 'Industry standards',
  } as Record<string, string>)[group] ?? group;
}

function brandLabel(brand: string, language: AppLanguage) {
  if (language === 'zh') return brand;
  return ({
    '柯达': 'Kodak', '富士': 'Fujifilm', '爱克发': 'Agfa', '福马': 'Foma', '伊尔福': 'Ilford',
    '柯尼卡': 'Konica', '代代红': 'Daidaihong', '乐凯': 'Lucky', '上海': 'Shanghai', 'Wolfen': 'Wolfen',
    '宾得': 'Pentax', '哈苏': 'Hasselblad', '佳能': 'Canon', '玛米亚': 'Mamiya', '美能达': 'Minolta',
    '尼康': 'Nikon', '其他': 'Other', '施耐德': 'Schneider', '仙娜': 'Sinar', '长步道': 'Chamonix', '禄来': 'Rollei',
    '暗房设备': 'Darkroom equipment', '冲洗工艺': 'Processing', '电影制作': 'Motion picture production',
    '感光材料与影像': 'Photosensitive materials & imaging', '其他资料': 'Other references', '行业标准与规范': 'Industry standards',
  } as Record<string, string>)[brand] ?? brand;
}

function formatSize(size = 0) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

function equipmentTitle(fileName: string) {
  return fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const pdfNameTranslations: Array<[string, string]> = [
  ['柯达', 'Kodak'], ['富士', 'Fujifilm'], ['爱克发', 'Agfa'], ['伊尔福', 'Ilford'],
  ['福马', 'Foma'], ['柯尼卡', 'Konica'], ['乐凯', 'Lucky'], ['代代红', 'Daidaihong'],
  ['上海', 'Shanghai'], ['太行', 'Taihang'], ['黑白', 'B&W '], ['彩色', 'Color '], ['金', 'Gold '],
  ['宾得', 'Pentax'], ['哈苏', 'Hasselblad'], ['佳能', 'Canon'], ['玛米亚', 'Mamiya'], ['美能达', 'Minolta'],
  ['尼康', 'Nikon'], ['施耐德', 'Schneider'], ['仙娜', 'Sinar'], ['长步道', 'Chamonix'],
  ['电影', 'Motion picture '], ['胶卷', 'film '], ['胶片', 'film '], ['底片', 'negative'],
  ['照相', 'photographic'], ['说明书', 'manual'], ['电子', 'electronic'], ['维修手册', 'service manual'],
  ['维修', 'service'], ['手册', 'manual'], ['镜头', 'lens'], ['相机', 'camera'], ['滤镜', 'filter'],
  ['技术文档', 'technical data sheet'], ['资料', 'reference'], ['牌', 'brand '], ['型', ' model '],
];

function localizePdfName(value: string, language: AppLanguage) {
  if (language === 'zh') return value;
  let localized = value;
  for (const [source, target] of pdfNameTranslations) localized = localized.replaceAll(source, target);
  return localized
    .replace(/([A-Za-z])(?=\d)/g, '$1 ')
    .replace(/(\d)(?=[A-Za-z])/g, '$1 ')
    .replace(/([A-Za-z])(?=[\u3400-\u9fff])/g, '$1 ')
    .replace(/([\u3400-\u9fff])(?=[A-Za-z])/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function displayFilmTitle(brand: string, file: FilmFile, language: AppLanguage) {
  return reviewedTitle(file.fileName, language) ?? localizePdfName(filmTitle(brand, file), language);
}

function displayEquipmentTitle(fileName: string, language: AppLanguage) {
  return reviewedTitle(fileName, language) ?? localizePdfName(equipmentTitle(fileName), language);
}

function displayIndustryTitle(fileName: string, language: AppLanguage) {
  return reviewedTitle(fileName, language) ?? localizePdfName(industryTitle(fileName), language);
}

function displayFileName(fileName: string, language: AppLanguage) {
  const title = reviewedTitle(fileName, language);
  if (language === 'en' && title) return `${title}.pdf`;
  return localizePdfName(fileName, language);
}

function reviewedTitle(fileName: string, language: AppLanguage) {
  return (reviewedDocumentTitles as Record<string, { zh: string; en: string }>)[fileName]?.[language];
}

function industryPath(group: IndustryGroup) {
  return group.path ?? group.name;
}

function dataBytes(value: Awaited<ReturnType<typeof window.library.readPdf>>) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(value.data);
}

interface PdfSource {
  title: string;
  fileName: string;
  fileSize?: number;
  read: () => Promise<Uint8Array | ArrayBuffer | { type: 'Buffer'; data: number[] }>;
}

interface SearchResult {
  title: string;
  fileName: string;
  fileSize?: number;
  category: Category;
  source: string;
  kind?: LibraryDocument['kind'];
  open: () => void;
}

function App() {
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [brands, setBrands] = useState<FilmBrand[]>([]);
  const [equipmentBrands, setEquipmentBrands] = useState<EquipmentBrand[]>([]);
  const [industryGroups, setIndustryGroups] = useState<IndustryGroup[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category>('全部资料');
  const [selectedBrandName, setSelectedBrandName] = useState<string | null>(null);
  const [selectedEquipmentBrandName, setSelectedEquipmentBrandName] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [language, setLanguage] = useState<AppLanguage>('zh');
  const [editing, setEditing] = useState(false);
  const [viewerSource, setViewerSource] = useState<PdfSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const categoryViews = useRef(new Map<Category, { brand: string | null; equipment: string | null }>());
  const pageKey = JSON.stringify([activeCategory, query.trim().toLocaleLowerCase(), selectedBrandName, selectedEquipmentBrandName]);
  const { contentRef, rememberPosition } = usePageScroll(pageKey, !loading);
  const selected = documents.find((document) => document.id === selectedId) ?? null;
  const selectedBrand = brands.find((brand) => brand.name === selectedBrandName) ?? null;
  const selectedEquipmentBrand = equipmentBrands.find((brand) => brand.name === selectedEquipmentBrandName) ?? null;

  function navigate(category: Category, brand: string | null = null, equipment: string | null = null) {
    rememberPosition();
    categoryViews.current.set(activeCategory, { brand: selectedBrandName, equipment: selectedEquipmentBrandName });
    setActiveCategory(category);
    setSelectedBrandName(brand);
    setSelectedEquipmentBrandName(equipment);
  }

  function switchCategory(category: Category) {
    if (category === activeCategory) return;
    const previous = categoryViews.current.get(category);
    navigate(category, previous?.brand ?? null, previous?.equipment ?? null);
  }

  function updateQuery(value: string) {
    rememberPosition();
    setQuery(value);
  }

  async function refresh() {
    setDocuments(await window.library.list());
  }

  useEffect(() => {
    Promise.all([refresh(), window.library.listBrands().then(setBrands), window.library.listEquipmentBrands().then(setEquipmentBrands), window.library.listIndustryGroups().then(setIndustryGroups)])
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return documents.filter((document) => {
      const categoryMatches = activeCategory === '全部资料' || document.category === activeCategory;
      const queryMatches = !normalizedQuery || [
        document.title, document.category, document.fileName, document.url,
        document.tags.join(' '), document.notes, document.text,
      ].some((field) => field?.toLocaleLowerCase().includes(normalizedQuery));
      return categoryMatches && queryMatches;
    });
  }, [documents, activeCategory, query]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingMaterials = useMemo<SearchResult[]>(() => {
    const results: SearchResult[] = [];
    const matches = (fields: Array<string | undefined>) => !normalizedQuery || fields.some((field) => field?.toLocaleLowerCase().includes(normalizedQuery));
    const categoryMatches = (category: Category) => activeCategory === '全部资料' || activeCategory === category;

    for (const document of documents) {
      const title = localizePdfName(document.title, language);
      if (!categoryMatches(document.category) || !matches([document.title, title, document.category, document.fileName, document.url, document.tags.join(' '), document.notes, document.text])) continue;
      results.push({
        title,
        fileName: document.fileName ?? document.url ?? '',
        fileSize: document.fileSize,
        category: document.category,
        source: documentStatusLabel(document.status, language),
        kind: document.kind,
        open: () => { if (document.kind === 'PDF') openImportedPdf(document); else if (document.url) void window.library.openLink(document.url); },
      });
    }

    if (categoryMatches('感光材料')) {
      for (const brand of brands) {
        for (const file of [...brand.staticFilms, ...brand.movieFilms]) {
          const title = displayFilmTitle(brand.name, file, language);
          if (!matches([brand.name, title, filmTitle(brand.name, file), file.fileName, file.status, file.collection])) continue;
          results.push({
            title,
            fileName: file.fileName,
            fileSize: file.fileSize,
            category: '感光材料',
            source: `${brandLabel(brand.name, language)} · ${collectionLabel(file.collection, language)} · ${statusLabel(file.status, language)}`,
            open: () => setViewerSource({ title, fileName: file.fileName, fileSize: file.fileSize, read: () => window.library.readBrandPdf(brand.name, file.collection, file.status, file.fileName) }),
          });
        }
      }
    }

    if (categoryMatches('相机资料')) {
      for (const brand of equipmentBrands) {
        for (const category of equipmentCategories) {
          for (const file of brand.categories[category]) {
            const title = displayEquipmentTitle(file.fileName, language);
            if (!matches([brand.name, category, title, equipmentTitle(file.fileName), file.fileName])) continue;
            results.push({
              title: `${brandLabel(brand.name, language)} · ${title}`,
              fileName: file.fileName,
              fileSize: file.fileSize,
              category: '相机资料',
              source: `${brandLabel(brand.name, language)} · ${equipmentCategoryLabel(category, language)}`,
              open: () => setViewerSource({ title, fileName: file.fileName, fileSize: file.fileSize, read: () => window.library.readEquipmentPdf(brand.name, category, file.fileName) }),
            });
          }
        }
      }
    }

    for (const group of industryGroups) {
      const category: Category = processingGroupNames.has(group.name) ? '冲洗工艺' : '技术文档';
      if (!categoryMatches(category)) continue;
      for (const file of group.files) {
        const title = displayIndustryTitle(file.fileName, language);
        if (!matches([group.name, title, industryTitle(file.fileName), file.fileName])) continue;
        results.push({
          title,
          fileName: file.fileName,
          fileSize: file.fileSize,
          category,
          source: industryGroupLabel(group.name, language),
          open: () => setViewerSource({ title, fileName: file.fileName, fileSize: file.fileSize, read: () => window.library.readIndustryPdf(industryPath(group), file.fileName) }),
        });
      }
    }
    return results;
  }, [activeCategory, brands, documents, equipmentBrands, industryGroups, language, normalizedQuery]);

  const indexedCount = documents.filter((document) => document.status === '已索引').length;
  const selectedIndex = filteredDocuments.findIndex((document) => document.id === selectedId);
  const showBrandLibrary = activeCategory === '感光材料';
  const showEquipmentLibrary = activeCategory === '相机资料';
  const processingGroups = orderedProcessingGroups(industryGroups);
  const technicalGroups = industryGroups.filter((group) => !processingGroupNames.has(group.name));
  const processingDocumentCount = processingGroups.reduce((sum, group) => sum + group.files.length, 0);
  const industryDocumentCount = technicalGroups.reduce((sum, group) => sum + group.files.length, 0);

  function openImportedPdf(document: LibraryDocument) {
    setViewerSource({ title: localizePdfName(document.title, language), fileName: document.fileName ?? '', fileSize: document.fileSize, read: () => window.library.readPdf(document.id) });
  }

  function openFilmPdf(brand: FilmBrand, collection: FilmCollection, file: FilmFile) {
    setViewerSource({
      title: displayFilmTitle(brand.name, file, language),
      fileName: file.fileName,
      fileSize: file.fileSize,
      read: () => window.library.readBrandPdf(brand.name, collection, file.status, file.fileName),
    });
  }

  async function saveDocument(patch: Partial<LibraryDocument>) {
    if (!selected) return;
    const updated = await window.library.save({ id: selected.id, ...patch });
    setDocuments((current) => current.map((item) => item.id === updated.id ? updated : item));
    setEditing(false);
  }

  async function removeDocument() {
    if (!selected) return;
    if (!window.confirm(localize(language, `从资料库移除“${selected.title}”？本地 PDF 文件也会一并删除。`, `Remove “${selected.title}” from the library? The local PDF will also be deleted.`))) return;
    await window.library.remove(selected.id);
    setDocuments((current) => current.filter((item) => item.id !== selected.id));
    setSelectedId(null);
    setNotice(localize(language, '资料已移除', 'Document removed'));
  }

  function moveSelection(direction: -1 | 1) {
    const next = filteredDocuments[selectedIndex + direction];
    if (next) setSelectedId(next.id);
  }

  return (
    <LanguageContext.Provider value={language}>
      <PageMemoryProvider>
      <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-rail">
          <div className="brand-lockup">
            <div className="brand-mark"><img src={appIconImage} alt="银盐图书馆" /></div>
            <div className="brand-copy"><strong className={language === 'en' ? 'brand-title-en' : undefined}>{language === 'zh' ? '银盐图书馆' : 'Silvergrain Library'}</strong><span>Design by ELEVANFILM</span></div>
          </div>

          <nav className="category-nav" aria-label={language === 'zh' ? '资料分类' : 'Categories'}>
            {categories.map((category) => {
              const Icon = categoriesIcon[category];
              return <button
                key={category}
                className={`category-item ${activeCategory === category ? 'active' : ''}`}
                aria-current={activeCategory === category ? 'page' : undefined}
                onClick={() => switchCategory(category)}
              >
                {category === '相机资料'
                  ? <img src={cameraIconImage} alt="" className="category-camera-image" />
                  : category === '感光材料'
                    ? <img src={filmIconImage} alt="" className="category-film-image" />
                    : categoryImages[category]
                      ? <img src={categoryImages[category]} alt="" className="category-generated-image" />
                      : <Icon size={25} strokeWidth={1.9} />}
                <span>{categoryLabel(category, language)}</span>
              </button>;
            })}
          </nav>

          <div className="side-divider" />
          <div className="sidebar-bottom">
            <a className="sidebar-link" href="https://shop124489225.taobao.com/" onClick={(event) => { event.preventDefault(); void window.library.openLink('https://shop124489225.taobao.com/'); }}>
              <Link2 size={16} />
              <span>{localize(language, '拾忆菲林官方店铺', 'ELEVANFILM Official Store')}</span>
            </a>
            <a className="sidebar-link" href="https://elevanfilm.com/" onClick={(event) => { event.preventDefault(); void window.library.openLink('https://elevanfilm.com/'); }}>
              <Link2 size={16} />
              <span>elevanfilm.com</span>
            </a>
            <button className="language-toggle" type="button" onClick={() => setLanguage((current) => current === 'zh' ? 'en' : 'zh')} aria-label={language === 'zh' ? '切换到英文' : 'Switch to Chinese'}>
              <Languages size={16} />
              <span>{language === 'zh' ? '中文' : 'English'}</span>
              <small>{language === 'zh' ? 'EN' : 'ZH'}</small>
            </button>
            <div className="sidebar-version">{language === 'zh' ? '银盐图书馆' : 'Silvergrain Library'} <span>0.1.0</span></div>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <nav className="breadcrumbs" aria-label={language === 'zh' ? '当前位置' : 'Current location'}>
            <button onClick={() => navigate('全部资料')}>{language === 'zh' ? '资料库' : 'Library'}</button>
            <ChevronRight size={14} />
            {showBrandLibrary ? <>
              <button aria-current={activeCategory === '感光材料' && !selectedBrandName ? 'page' : undefined} onClick={() => navigate('感光材料')}>{categoryLabel('感光材料', language)}</button>
              {selectedBrandName && <><ChevronRight size={14} /><strong aria-current="page">{brandLabel(selectedBrandName, language)}</strong></>}
            </> : showEquipmentLibrary ? <>
              <button aria-current={!selectedEquipmentBrandName ? 'page' : undefined} onClick={() => navigate('相机资料')}>{categoryLabel('相机资料', language)}</button>
              {selectedEquipmentBrandName && <><ChevronRight size={14} /><strong aria-current="page">{brandLabel(selectedEquipmentBrandName, language)}</strong></>}
            </> : <button aria-current="page" onClick={() => setActiveCategory(activeCategory)}>{categoryLabel(activeCategory, language)}</button>}
          </nav>
          <div className="topbar-actions">
            <label className="global-search">
              <Search size={16} />
              <input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder={language === 'zh' ? '搜索资料' : 'Search materials'} aria-label={language === 'zh' ? '搜索资料' : 'Search materials'} />
              {query && <button type="button" aria-label={localize(language, '清除搜索', 'Clear search')} title={localize(language, '清除搜索', 'Clear search')} onClick={() => updateQuery('')}><X size={14} /></button>}
            </label>
          </div>
        </header>

        <section className="content-area" ref={contentRef} onScroll={rememberPosition}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">{language === 'zh' ? '胶片知识库' : 'FILM KNOWLEDGE BASE'} <span>·</span> {language === 'zh' ? '个人档案' : 'PERSONAL ARCHIVE'}</div>
              <h1>{showBrandLibrary ? selectedBrandName ? brandLabel(selectedBrandName, language) : categoryLabel('感光材料', language) : showEquipmentLibrary ? selectedEquipmentBrandName ? brandLabel(selectedEquipmentBrandName, language) : categoryLabel('相机资料', language) : categoryLabel(activeCategory, language)}</h1>
              <p>{showBrandLibrary ? selectedBrand ? localize(language, `${selectedBrand.count} 份胶片技术资料 · 按在产状态分类`, `${selectedBrand.count} film technical documents · grouped by production status`) : localize(language, `${brands.length} 个品牌 · ${brands.reduce((sum, brand) => sum + brand.count, 0)} 份胶片技术资料`, `${brands.length} brands · ${brands.reduce((sum, brand) => sum + brand.count, 0)} film technical documents`) : showEquipmentLibrary ? selectedEquipmentBrand ? localize(language, `${selectedEquipmentBrand.count} 份器材资料 · 按资料类型分类`, `${selectedEquipmentBrand.count} equipment documents · grouped by document type`) : localize(language, `${equipmentBrands.length} 个品牌 · ${equipmentBrands.reduce((sum, brand) => sum + brand.count, 0)} 份摄影器材资料`, `${equipmentBrands.length} brands · ${equipmentBrands.reduce((sum, brand) => sum + brand.count, 0)} photography equipment documents`) : activeCategory === '技术文档' ? localize(language, `${industryDocumentCount} 份行业资料`, `${industryDocumentCount} technical documents`) : activeCategory === '冲洗工艺' ? localize(language, `${processingDocumentCount} 份冲洗工艺资料 · 按工艺分类`, `${processingDocumentCount} processing documents · grouped by process`) : activeCategory === '全部资料' ? localize(language, `${matchingMaterials.length} 份资料 · 所有分类`, `${matchingMaterials.length} materials · all categories`) : localize(language, '胶片、化学与器材的技术资料，集中整理于此。', 'Technical references for film, chemistry, and equipment.')}</p>
            </div>
            <div className="heading-actions">
              {(selectedBrand || selectedEquipmentBrand) && <button className="secondary-button" onClick={() => navigate(activeCategory)}><ChevronLeft size={15} />{localize(language, '品牌列表', 'Brand list')}</button>}
              <CatalogTree
                activeCategory={activeCategory}
                selectedBrandName={selectedBrandName}
                selectedEquipmentBrandName={selectedEquipmentBrandName}
                brands={brands}
                equipmentBrands={equipmentBrands}
                industryGroups={industryGroups}
                onSelectCategory={(category) => navigate(category)}
                onSelectBrand={(brand) => navigate('感光材料', brand.name)}
                onSelectEquipmentBrand={(brand) => navigate('相机资料', null, brand.name)}
              />
            </div>
          </div>

          {activeCategory === '其他' && <div className="overview-strip">
            <div className="overview-stat"><span>{localize(language, '资料条目', 'Documents')}</span><strong>{documents.length}</strong><small>{localize(language, '所有分类', 'All categories')}</small></div>
            <div className="stat-rule" />
            <div className="overview-stat"><span>{localize(language, '可检索文档', 'Searchable')}</span><strong>{indexedCount}</strong><small>{localize(language, '已提取文本', 'Text extracted')}</small></div>
            <div className="stat-rule" />
            <div className="overview-stat"><span>{localize(language, '最近加入', 'Recently added')}</span><strong className="recent-stat">{documents[0] ? formatDate(documents[0].addedAt) : '—'}</strong><small>{documents[0] ? localizePdfName(documents[0].title, language) : localize(language, '等待导入资料', 'Waiting for materials')}</small></div>
          </div>}

          {normalizedQuery ? <SearchResults results={matchingMaterials} loading={loading} /> : activeCategory === '全部资料' ? <AllMaterialsLibrary
            materials={matchingMaterials}
            loading={loading}
            onSelectCategory={switchCategory}
          /> : showBrandLibrary ? <BrandLibrary
            brands={brands}
            selectedBrand={selectedBrand}
            loading={loading}
            onSelectBrand={(brand) => navigate('感光材料', brand.name)}
            onOpenPdf={openFilmPdf}
          /> : showEquipmentLibrary ? <EquipmentLibrary
            brands={equipmentBrands}
            selectedBrand={selectedEquipmentBrand}
            loading={loading}
            onSelectBrand={(brand) => navigate('相机资料', null, brand.name)}
            onOpenPdf={(brand, category, file) => setViewerSource({
              title: displayEquipmentTitle(file.fileName, language),
              fileName: file.fileName,
              fileSize: file.fileSize,
              read: () => window.library.readEquipmentPdf(brand.name, category, file.fileName),
            })}
          /> : activeCategory !== '技术文档' && activeCategory !== '冲洗工艺' ? <section className="library-section">
            <div className="section-heading">
              <div><h2>{localize(language, '资料条目', 'Documents')}</h2><span>{localize(language, `${filteredDocuments.length} 条`, `${filteredDocuments.length} items`)}</span></div>
              <button className="quiet-button" title={localize(language, '筛选资料', 'Filter materials')} onClick={() => setNotice(localize(language, '当前按分类和全文关键词筛选。', 'Filtering by category and full-text keywords.'))}><Filter size={15} />{localize(language, '筛选', 'Filter')}</button>
            </div>
            <div className="list-toolbar">
              <label className="search-box"><Search size={16} /><input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder={localize(language, '搜索标题、标签、笔记或 PDF 全文', 'Search titles, tags, notes, or PDF text')} /><kbd>Enter</kbd>{query && <button aria-label={localize(language, '清除搜索', 'Clear search')} onClick={() => updateQuery('')}><X size={14} /></button>}</label>
              <div className="list-toolbar-right"><span><ArrowDownUp size={14} />{localize(language, '最近添加', 'Recently added')}</span><button aria-label={localize(language, '显示选项', 'Display options')} title={localize(language, '显示选项', 'Display options')}><MoreHorizontal size={18} /></button></div>
            </div>

            <div className={`document-layout ${selected ? 'with-detail' : ''}`}>
              <div className="document-list">
                <div className="list-labels"><span>{localize(language, '名称', 'Name')}</span><span>{localize(language, '分类', 'Category')}</span><span>{localize(language, '状态', 'Status')}</span><span>{localize(language, '加入日期', 'Added')}</span></div>
                {loading ? <div className="loading-state"><LoaderCircle size={20} className="spin" />{localize(language, '正在读取本地资料库', 'Loading local library')}</div> : filteredDocuments.length ? filteredDocuments.map((document) => (
                  <button key={document.id} className={`document-row ${selectedId === document.id ? 'selected' : ''}`} onClick={() => { setSelectedId(document.id); setEditing(false); }}>
                    <div className={`file-mark ${document.kind === 'PDF' ? 'pdf' : 'link'}`}>{document.kind === 'PDF' ? <FileText size={17} /> : <Link2 size={17} />}</div>
                    <div className="document-name"><strong>{localizePdfName(document.title, language)}</strong><span>{document.kind === 'PDF' ? `${displayFileName(document.fileName ?? '', language)} · ${formatSize(document.fileSize)}` : document.url}</span></div>
                    <div className="category-cell">{categoryLabel(document.category, language)}</div>
                    <div className={`status-cell ${document.status === '已索引' ? 'indexed' : ''}`}><i />{documentStatusLabel(document.status, language)}</div>
                    <div className="date-cell">{formatDate(document.addedAt)}</div>
                  </button>
                )) : <EmptyState hasQuery={Boolean(query)} />}
              </div>
              {selected && <DetailPanel
                document={selected}
                documents={documents}
                editing={editing}
                onEdit={() => setEditing(true)}
                onCancel={() => setEditing(false)}
                onSave={saveDocument}
                onOpen={() => selected.kind === 'PDF' ? openImportedPdf(selected) : selected.url && window.library.openLink(selected.url)}
                onDelete={removeDocument}
                onClose={() => setSelectedId(null)}
                onRelated={setSelectedId}
              />}
            </div>
            {filteredDocuments.length > 0 && <div className="list-footer"><span>{localize(language, `显示 ${filteredDocuments.length} 条资料`, `Showing ${filteredDocuments.length} items`)}</span><div><button aria-label={localize(language, '上一条', 'Previous')} onClick={() => moveSelection(-1)} disabled={selectedIndex <= 0}><ChevronLeft size={15} /></button><span>{selectedIndex >= 0 ? selectedIndex + 1 : '—'} / {filteredDocuments.length}</span><button aria-label={localize(language, '下一条', 'Next')} onClick={() => moveSelection(1)} disabled={selectedIndex >= filteredDocuments.length - 1}><ChevronRight size={15} /></button></div></div>}
          </section> : null}

          {!normalizedQuery && activeCategory === '技术文档' && <section className="library-section merged-industry-section">
            <div className="section-heading"><div><h2>{localize(language, '行业资料', 'Technical references')}</h2><span>{localize(language, `${industryDocumentCount} 份`, `${industryDocumentCount} items`)}</span></div></div>
            <IndustryLibrary groups={technicalGroups} loading={loading} onOpenPdf={(group, file) => setViewerSource({ title: displayIndustryTitle(file.fileName, language), fileName: file.fileName, fileSize: file.fileSize, read: () => window.library.readIndustryPdf(industryPath(group), file.fileName) })} />
          </section>}

          {!normalizedQuery && activeCategory === '冲洗工艺' && <section className="library-section merged-industry-section">
            <div className="section-heading"><div><h2>{localize(language, '冲洗工艺', 'Processing')}</h2><span>{localize(language, `${processingDocumentCount} 份`, `${processingDocumentCount} items`)}</span></div></div>
            <IndustryLibrary groups={processingGroups} loading={loading} onOpenPdf={(group, file) => setViewerSource({ title: displayIndustryTitle(file.fileName, language), fileName: file.fileName, fileSize: file.fileSize, read: () => window.library.readIndustryPdf(industryPath(group), file.fileName) })} />
          </section>}

          <footer className="page-footer"><span>{language === 'zh' ? '银盐图书馆' : 'Silvergrain Library'}</span></footer>
        </section>
      </main>

      {viewerSource && <PdfViewer source={viewerSource} onClose={() => setViewerSource(null)} />}
      {notice && <div className="toast"><Check size={16} />{notice}<button aria-label={localize(language, '关闭提示', 'Close notification')} onClick={() => setNotice('')}><X size={14} /></button></div>}
      </div>
      </PageMemoryProvider>
    </LanguageContext.Provider>
  );
}

function AllMaterialsLibrary({ materials, loading, onSelectCategory }: {
  materials: SearchResult[];
  loading: boolean;
  onSelectCategory: (category: Category) => void;
}) {
  const language = useAppLanguage();
  return <div className="all-materials-library">
    <nav className="all-materials-categories" aria-label={localize(language, '资料分类', 'Categories')}>
      {categories.filter(category => category !== '全部资料').map(category => {
        const Icon = categoriesIcon[category];
        const image = category === '感光材料' ? filmIconImage : category === '相机资料' ? cameraIconImage : categoryImages[category];
        const count = materials.filter(material => material.category === category).length;
        return <button className="all-materials-category" key={category} onClick={() => onSelectCategory(category)}>
          {image ? <img src={image} alt="" /> : <Icon size={32} />}
          <span><strong>{categoryLabel(category, language)}</strong><small>{loading ? '…' : localize(language, `${count} 份资料`, `${count} items`)}</small></span>
          <ChevronRight size={16} />
        </button>;
      })}
    </nav>
    <SearchResults results={materials} loading={loading} hasQuery={false} />
  </div>;
}

function SearchResults({ results, loading, hasQuery = true }: { results: SearchResult[]; loading: boolean; hasQuery?: boolean }) {
  const language = useAppLanguage();
  if (loading) return <div className="loading-state"><LoaderCircle size={20} className="spin" />{localize(language, '正在读取本地资料库', 'Loading local library')}</div>;
  return <section className="library-section search-results-section">
    <div className="section-heading"><div><h2>{hasQuery ? localize(language, '搜索结果', 'Search results') : localize(language, '资料条目', 'Documents')}</h2><span>{localize(language, `${results.length} 条`, `${results.length} items`)}</span></div></div>
    <div className="document-layout">
      <div className="document-list">
        <div className="list-labels"><span>{localize(language, '名称', 'Name')}</span><span>{localize(language, '分类', 'Category')}</span><span>{localize(language, '来源', 'Source')}</span><span>{localize(language, '操作', 'Action')}</span></div>
        {results.length ? results.map((result, index) => <button key={`${result.category}-${result.fileName}-${index}`} className="document-row" onClick={result.open}>
          <div className={`file-mark ${result.kind === 'LINK' ? 'link' : 'pdf'}`}>{result.kind === 'LINK' ? <Link2 size={17} /> : <FileText size={17} />}</div>
          <div className="document-name"><strong>{result.title}</strong><span>{displayFileName(result.fileName, language)}{result.fileSize ? ` · ${formatSize(result.fileSize)}` : ''}</span></div>
          <div className="category-cell">{categoryLabel(result.category, language)}</div>
          <div className="status-cell indexed result-source" title={result.source}>{result.source}</div>
          <div className="date-cell">{localize(language, '打开', 'Open')}</div>
        </button>) : <EmptyState hasQuery={hasQuery} />}
      </div>
    </div>
  </section>;
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  const language = useAppLanguage();
  return <div className="empty-state"><div className="empty-mark"><Aperture size={25} /></div><h3>{hasQuery ? localize(language, '没有匹配的资料', 'No matching materials') : localize(language, '暂无资料', 'No materials')}</h3><p>{hasQuery ? localize(language, '试试其他关键词，或切换分类查看。', 'Try another keyword or switch categories.') : localize(language, '当前目录下还没有收录资料。', 'This section has no materials yet.')}</p></div>;
}

function CatalogTree({ activeCategory, selectedBrandName, selectedEquipmentBrandName, brands, equipmentBrands, industryGroups, onSelectCategory, onSelectBrand, onSelectEquipmentBrand }: {
  activeCategory: Category;
  selectedBrandName: string | null;
  selectedEquipmentBrandName: string | null;
  brands: FilmBrand[];
  equipmentBrands: EquipmentBrand[];
  industryGroups: IndustryGroup[];
  onSelectCategory: (category: Category) => void;
  onSelectBrand: (brand: FilmBrand) => void;
  onSelectEquipmentBrand: (brand: EquipmentBrand) => void;
}) {
  const language = useAppLanguage();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pendingTarget, setPendingTarget] = useState<{ category: Category; brandName?: string | null; equipmentBrandName?: string | null }>({ category: activeCategory, brandName: selectedBrandName, equipmentBrandName: selectedEquipmentBrandName });
  const isExpanded = (key: string) => expanded[key] ?? false;
  const toggle = (key: string) => setExpanded((current) => ({ ...current, [key]: !isExpanded(key) }));
  const processingGroups = orderedProcessingGroups(industryGroups);
  const technicalGroups = industryGroups.filter((group) => !processingGroupNames.has(group.name));
  const hasCategoryChildren = (category: Category) => category === '感光材料' || category === '相机资料' || category === '技术文档' || category === '冲洗工艺';
  const pendingBrand = pendingTarget.brandName ? brands.find((brand) => brand.name === pendingTarget.brandName) : null;
  const pendingEquipmentBrand = pendingTarget.equipmentBrandName ? equipmentBrands.find((brand) => brand.name === pendingTarget.equipmentBrandName) : null;

  useEffect(() => {
    setPendingTarget({ category: activeCategory, brandName: selectedBrandName, equipmentBrandName: selectedEquipmentBrandName });
  }, [activeCategory, selectedBrandName, selectedEquipmentBrandName]);

  function jumpToPending() {
    if (pendingTarget.category === '感光材料' && pendingBrand) {
      onSelectBrand(pendingBrand);
      return;
    }
    if (pendingTarget.category === '相机资料' && pendingEquipmentBrand) {
      onSelectEquipmentBrand(pendingEquipmentBrand);
      return;
    }
    onSelectCategory(pendingTarget.category);
  }

  const pendingIsCategory = (category: Category) => pendingTarget.category === category && !pendingTarget.brandName && !pendingTarget.equipmentBrandName;

  return <div className="catalog-tree">
    <div className="catalog-actions">
      <button className="secondary-button catalog-trigger" aria-expanded={isExpanded('全部资料')} onClick={() => toggle('全部资料')}><FolderOpen size={16} />{localize(language, '目录', 'Catalog')}<ChevronDown className={isExpanded('全部资料') ? '' : 'collapsed'} size={15} /></button>
      <button className="primary-button catalog-jump" onClick={jumpToPending}><ArrowRight size={14} />{localize(language, '跳转', 'Go')}</button>
    </div>
    {isExpanded('全部资料') && <div className="catalog-panel" role="tree" aria-label={localize(language, '资料目录', 'Material catalog')}>
      <button className={`catalog-row depth-0 ${pendingIsCategory('全部资料') ? 'selected' : ''}`} role="treeitem" aria-expanded={isExpanded('全部资料')} onClick={() => { setPendingTarget({ category: '全部资料', brandName: null, equipmentBrandName: null }); toggle('全部资料'); }}><Archive size={15} /><span>{categoryLabel('全部资料', language)}</span><ChevronDown className={isExpanded('全部资料') ? '' : 'collapsed'} size={14} /></button>
      {categories.filter((category) => category !== '全部资料').map((category) => {
        const children = category === '感光材料' ? brands.length : category === '相机资料' ? equipmentBrands.length : category === '技术文档' ? technicalGroups.length : category === '冲洗工艺' ? processingGroups.length : 0;
        const open = isExpanded(category);
        const Icon = categoriesIcon[category];
        return <div key={category}>
          <button className={`catalog-row depth-1 ${pendingIsCategory(category) ? 'selected' : ''}`} role="treeitem" aria-expanded={hasCategoryChildren(category) ? open : undefined} onClick={() => { setPendingTarget({ category, brandName: null, equipmentBrandName: null }); if (hasCategoryChildren(category)) toggle(category); }}>
            {category === '相机资料' ? <img src={cameraIconImage} alt="" /> : category === '感光材料' ? <img src={filmIconImage} alt="" /> : categoryImages[category] ? <img src={categoryImages[category]} alt="" /> : <Icon size={15} />}
            <span>{categoryLabel(category, language)}</span>{children > 0 && <small>{children}</small>}{hasCategoryChildren(category) && <ChevronDown className={open ? '' : 'collapsed'} size={13} />}
          </button>
          {open && category === '感光材料' && <div className="catalog-children">{brands.map((brand) => {
            const brandKey = `film-${brand.name}`;
            const brandOpen = isExpanded(brandKey);
            return <div key={brand.name}>
              <button className={`catalog-row depth-2 ${pendingTarget.category === '感光材料' && pendingTarget.brandName === brand.name ? 'selected' : ''}`} role="treeitem" aria-expanded={brandOpen} onClick={() => { setPendingTarget({ category: '感光材料', brandName: brand.name, equipmentBrandName: null }); toggle(brandKey); }}><Film size={14} /><span>{brandLabel(brand.name, language)}</span><small>{brand.count}</small><ChevronDown className={brandOpen ? '' : 'collapsed'} size={12} /></button>
              {brandOpen && <div className="catalog-leaves"><button className="catalog-leaf" onClick={() => setPendingTarget({ category: '感光材料', brandName: brand.name, equipmentBrandName: null })}>{collectionLabel('静态摄影胶片', language)}</button>{brand.movieFilms.length > 0 && <button className="catalog-leaf" onClick={() => setPendingTarget({ category: '感光材料', brandName: brand.name, equipmentBrandName: null })}>{collectionLabel('电影卷', language)}</button>}</div>}
            </div>;
          })}</div>}
          {open && category === '相机资料' && <div className="catalog-children">{equipmentBrands.map((brand) => {
            const brandKey = `equipment-${brand.name}`;
            const brandOpen = isExpanded(brandKey);
            const available = equipmentCategories.filter((item) => brand.categories[item].length > 0);
            return <div key={brand.name}>
              <button className={`catalog-row depth-2 ${pendingTarget.category === '相机资料' && pendingTarget.equipmentBrandName === brand.name ? 'selected' : ''}`} role="treeitem" aria-expanded={brandOpen} onClick={() => { setPendingTarget({ category: '相机资料', brandName: null, equipmentBrandName: brand.name }); toggle(brandKey); }}><Camera size={14} /><span>{brandLabel(brand.name, language)}</span><small>{brand.count}</small><ChevronDown className={brandOpen ? '' : 'collapsed'} size={12} /></button>
              {brandOpen && <div className="catalog-leaves">{available.map((item) => <button className="catalog-leaf" key={item} onClick={() => setPendingTarget({ category: '相机资料', brandName: null, equipmentBrandName: brand.name })}>{equipmentCategoryLabel(item, language)}</button>)}</div>}
            </div>;
          })}</div>}
          {open && category === '技术文档' && <div className="catalog-children">{technicalGroups.map((group) => <button className="catalog-row depth-2" role="treeitem" key={group.name} onClick={() => onSelectCategory('技术文档')}><BookOpen size={14} /><span>{industryGroupLabel(group.name, language)}</span><small>{group.files.length}</small></button>)}</div>}
          {open && category === '冲洗工艺' && <div className="catalog-children">{processingGroups.map((group) => <button className="catalog-row depth-2" role="treeitem" key={group.name} onClick={() => onSelectCategory('冲洗工艺')}><SlidersHorizontal size={14} /><span>{industryGroupLabel(group.name, language)}</span><small>{group.files.length}</small></button>)}</div>}
        </div>;
      })}
    </div>}
  </div>;
}

function industryTitle(fileName: string) {
  return fileName.replace(/\.pdf$/i, '').replace(/__+/g, ' / ').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function IndustryLibrary({ groups, loading, onOpenPdf }: {
  groups: IndustryGroup[];
  loading: boolean;
  onOpenPdf: (group: IndustryGroup, file: IndustryDocument) => void;
}) {
  const language = useAppLanguage();
  const disclosure = useDisclosureMemory();
  if (loading) return <div className="loading-state"><LoaderCircle size={20} className="spin" />{localize(language, '正在读取技术资料', 'Loading technical references')}</div>;
  if (!groups.length) return <div className="empty-state"><div className="empty-mark"><BookOpen size={25} /></div><h3>{localize(language, '当前分类暂无资料', 'No materials in this category')}</h3><p>{localize(language, '可从目录切换其他资料分类。', 'Switch categories from the catalog.')}</p></div>;
  return <div className="industry-library">{groups.map((group) => {
    const sectionKey = JSON.stringify(['industry', industryPath(group)]);
    const isCollapsed = disclosure.isCollapsed(sectionKey);
    return <section className="industry-group" key={group.name}>
      <button className="industry-group-heading" aria-expanded={!isCollapsed} onClick={() => disclosure.toggle(sectionKey)}>
        <span className="collection-title-icon"><BookOpen size={18} /></span><strong>{industryGroupLabel(group.name, language)}</strong><small>{localize(language, `${group.files.length} 份`, `${group.files.length} items`)}</small><ChevronDown className={isCollapsed ? 'collapsed' : ''} size={16} />
      </button>
      {!isCollapsed && (group.files.length ? <div className="industry-grid">{group.files.map((file) => <button className="film-preview" key={file.fileName} onClick={() => onOpenPdf(group, file)}>
        <PdfThumbnail fileName={file.fileName} read={() => window.library.readIndustryPdf(industryPath(group), file.fileName)} />
        <span className="film-preview-title">{displayIndustryTitle(file.fileName, language)}</span>
      </button>)}</div> : <div className="film-status-empty">{localize(language, '暂无资料', 'No materials')}</div>)}
    </section>;
  })}</div>;
}

function BrandLibrary({ brands, selectedBrand, loading, onSelectBrand, onOpenPdf }: {
  brands: FilmBrand[];
  selectedBrand: FilmBrand | null;
  loading: boolean;
  onSelectBrand: (brand: FilmBrand) => void;
  onOpenPdf: (brand: FilmBrand, collection: FilmCollection, file: FilmFile) => void;
}) {
  const language = useAppLanguage();
  if (loading) return <div className="loading-state"><LoaderCircle size={20} className="spin" />{localize(language, '正在读取胶片资料', 'Loading film materials')}</div>;
  if (selectedBrand) return <BrandDetail brand={selectedBrand} onOpenPdf={onOpenPdf} />;

  return <div className="brand-library">
    {brands.map((brand) => <section className="brand-preview-section" key={brand.name}>
      <div className="brand-preview-heading"><button onClick={() => onSelectBrand(brand)}><h2>{brandLabel(brand.name, language)}</h2><ChevronRight size={16} /></button><span>{localize(language, `${brand.count} 份资料`, `${brand.count} items`)}</span></div>
      <div className="brand-preview-grid">
        {brandPreviewFiles(brand).map((file) => <button className="film-preview" key={`${brand.name}-${file.collection}-${file.fileName}`} onClick={() => onOpenPdf(brand, file.collection, file)}>
          <PdfThumbnail fileName={file.fileName} read={() => window.library.readBrandPdf(brand.name, file.collection, file.status, file.fileName)} />
          <span className="film-preview-title">{displayFilmTitle(brand.name, file, language)}</span>
        </button>)}
      </div>
    </section>)}
  </div>;
}

function BrandDetail({ brand, onOpenPdf }: {
  brand: FilmBrand;
  onOpenPdf: (brand: FilmBrand, collection: FilmCollection, file: FilmFile) => void;
}) {
  return <div className="brand-detail">
    <FilmCollectionSection brand={brand} collection="静态摄影胶片" files={brand.staticFilms} onOpenPdf={onOpenPdf} />
    {brand.movieFilms.length > 0 && <FilmCollectionSection brand={brand} collection="电影卷" files={brand.movieFilms} onOpenPdf={onOpenPdf} />}
  </div>;
}

function EquipmentLibrary({ brands, selectedBrand, loading, onSelectBrand, onOpenPdf }: {
  brands: EquipmentBrand[];
  selectedBrand: EquipmentBrand | null;
  loading: boolean;
  onSelectBrand: (brand: EquipmentBrand) => void;
  onOpenPdf: (brand: EquipmentBrand, category: EquipmentCategory, file: EquipmentFile) => void;
}) {
  const language = useAppLanguage();
  if (loading) return <div className="loading-state"><LoaderCircle size={20} className="spin" />{localize(language, '正在读取器材资料', 'Loading equipment materials')}</div>;
  if (selectedBrand) return <EquipmentBrandDetail brand={selectedBrand} onOpenPdf={onOpenPdf} />;

  return <div className="brand-library">
    {brands.map((brand) => {
      const files = equipmentCategories.flatMap((category) => brand.categories[category].map((file) => ({ category, file })));
      return <section className="brand-preview-section" key={brand.name}>
        <div className="brand-preview-heading"><button onClick={() => onSelectBrand(brand)}><h2>{brandLabel(brand.name, language)}</h2><ChevronRight size={16} /></button><span>{localize(language, `${brand.count} 份资料`, `${brand.count} items`)}</span></div>
        <div className="brand-preview-grid">
          {files.slice(0, 3).map(({ category, file }) => <button className="film-preview" key={`${brand.name}-${category}-${file.fileName}`} onClick={() => onOpenPdf(brand, category, file)}>
            <PdfThumbnail fileName={file.fileName} read={() => window.library.readEquipmentPdf(brand.name, category, file.fileName)} />
            <span className="film-preview-title">{displayEquipmentTitle(file.fileName, language)}</span>
          </button>)}
        </div>
      </section>;
    })}
  </div>;
}

function EquipmentBrandDetail({ brand, onOpenPdf }: {
  brand: EquipmentBrand;
  onOpenPdf: (brand: EquipmentBrand, category: EquipmentCategory, file: EquipmentFile) => void;
}) {
  return <div className="brand-detail">
    {equipmentCategories.map((category) => <EquipmentCategorySection key={category} brand={brand} category={category} files={brand.categories[category]} onOpenPdf={onOpenPdf} />)}
  </div>;
}

function EquipmentCategorySection({ brand, category, files, onOpenPdf }: {
  brand: EquipmentBrand;
  category: EquipmentCategory;
  files: EquipmentFile[];
  onOpenPdf: (brand: EquipmentBrand, category: EquipmentCategory, file: EquipmentFile) => void;
}) {
  const language = useAppLanguage();
  const [collapsed, toggleCollapsed] = useSectionDisclosure(JSON.stringify(['equipment', brand.name, category]));
  return <section className="film-collection-section">
    <button className="film-collection-heading" aria-expanded={!collapsed} onClick={toggleCollapsed}>
      <span className="collection-title-icon"><Camera size={18} /></span><strong>{equipmentCategoryLabel(category, language)}</strong><small>{localize(language, `${files.length} 份`, `${files.length} items`)}</small><ChevronDown className={collapsed ? 'collapsed' : ''} size={16} />
    </button>
    {!collapsed && (files.length ? <div className="equipment-category-grid">{files.map((file) => <button className="film-preview" key={file.fileName} onClick={() => onOpenPdf(brand, category, file)}>
      <PdfThumbnail fileName={file.fileName} read={() => window.library.readEquipmentPdf(brand.name, category, file.fileName)} />
      <span className="film-preview-title">{displayEquipmentTitle(file.fileName, language)}</span>
    </button>)}</div> : <div className="film-status-empty">{localize(language, '暂无资料', 'No materials')}</div>)}
  </section>;
}

function FilmCollectionSection({ brand, collection, files, onOpenPdf }: {
  brand: FilmBrand;
  collection: FilmCollection;
  files: FilmFile[];
  onOpenPdf: (brand: FilmBrand, collection: FilmCollection, file: FilmFile) => void;
}) {
  const language = useAppLanguage();
  const [collapsed, toggleCollapsed] = useSectionDisclosure(JSON.stringify(['film', brand.name, collection]));
  return <section className="film-collection-section">
    <button className="film-collection-heading" aria-expanded={!collapsed} onClick={toggleCollapsed}>
      <span className="collection-title-icon"><Film size={18} /></span><strong>{collectionLabel(collection, language)}</strong><small>{localize(language, `${files.length} 份`, `${files.length} items`)}</small><ChevronDown className={collapsed ? 'collapsed' : ''} size={16} />
    </button>
    {!collapsed && <div className="film-status-groups">{filmStatuses.filter(status => status !== '待核实' || files.some(file => file.status === status)).map((status) => <FilmStatusSection
      key={`${collection}-${status}`}
      brand={brand}
      collection={collection}
      status={status}
      files={files.filter((file) => file.status === status)}
      onOpenPdf={onOpenPdf}
    />)}</div>}
  </section>;
}

function FilmStatusSection({ brand, collection, status, files, onOpenPdf }: {
  brand: FilmBrand;
  collection: FilmCollection;
  status: FilmStatus;
  files: FilmFile[];
  onOpenPdf: (brand: FilmBrand, collection: FilmCollection, file: FilmFile) => void;
}) {
  const language = useAppLanguage();
  const [collapsed, toggleCollapsed] = useSectionDisclosure(JSON.stringify(['film', brand.name, collection, status]));
  const orderedFiles = [...files].sort((left, right) => filmTitle(brand.name, left).localeCompare(filmTitle(brand.name, right), 'zh-CN'));
  return <section className="film-status-section">
    <button className="film-status-heading" aria-expanded={!collapsed} onClick={toggleCollapsed}>
      <span className={`status-badge ${status === '在产' ? 'current' : status === '待核实' ? 'unconfirmed' : 'discontinued'}`}>{statusLabel(status, language)}</span><small>{localize(language, `${files.length} 份资料`, `${files.length} items`)}</small><ChevronDown className={collapsed ? 'collapsed' : ''} size={15} />
    </button>
    {!collapsed && (files.length ? <div className="film-status-grid">{orderedFiles.map((file) => <button className="film-preview" key={`${collection}-${file.fileName}`} onClick={() => onOpenPdf(brand, collection, file)}>
      <PdfThumbnail fileName={file.fileName} read={() => window.library.readBrandPdf(brand.name, collection, file.status, file.fileName)} />
      <span className="film-preview-title">{displayFilmTitle(brand.name, file, language)}</span>
    </button>)}</div> : <div className="film-status-empty">{localize(language, `暂无${status}资料`, `No ${statusLabel(status, language).toLowerCase()} materials`)}</div>)}
  </section>;
}

function PdfThumbnail({ fileName, read }: { fileName: string; read: () => Promise<Uint8Array | ArrayBuffer | { type: 'Buffer'; data: number[] }> }) {
  const language = useAppLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || loaded || failed) return;
      observer.disconnect();
      read()
        .then((data) => loadPdf(dataBytes(data)))
        .then(async (pdf) => {
          const page = await pdf.getPage(1);
          const baseViewport = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: 210 / baseViewport.width });
          const context = canvas.getContext('2d');
          if (!context || cancelled) { await pdf.destroy(); return; }
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          await page.render({ canvasContext: context, viewport }).promise;
          await pdf.destroy();
          if (!cancelled) setLoaded(true);
        })
        .catch(() => { if (!cancelled) setFailed(true); });
    }, { rootMargin: '260px' });
    observer.observe(containerRef.current ?? canvas);
    return () => { cancelled = true; observer.disconnect(); };
  }, [fileName, failed, loaded]);

  return <div className="film-preview-page" ref={containerRef}>
    <canvas ref={canvasRef} className={loaded ? 'visible' : ''} />
    {!loaded && <div className={`film-preview-placeholder ${failed ? 'failed' : ''}`}><FileText size={24} />{failed ? localize(language, '预览不可用', 'Preview unavailable') : 'PDF'}</div>}
  </div>;
}

function DetailPanel({ document, documents, editing, onEdit, onCancel, onSave, onOpen, onDelete, onClose, onRelated }: {
  document: LibraryDocument;
  documents: LibraryDocument[];
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (patch: Partial<LibraryDocument>) => void;
  onOpen: () => void;
  onDelete: () => void;
  onClose: () => void;
  onRelated: (id: string) => void;
}) {
  const language = useAppLanguage();
  const [title, setTitle] = useState(document.title);
  const [category, setCategory] = useState<Category>(document.category);
  const [tags, setTags] = useState(document.tags.join('，'));
  const [notes, setNotes] = useState(document.notes);
  const [relatedIds, setRelatedIds] = useState(document.relatedIds);
  const [relatedToAdd, setRelatedToAdd] = useState('');

  useEffect(() => {
    setTitle(document.title); setCategory(document.category); setTags(document.tags.join('，')); setNotes(document.notes); setRelatedIds(document.relatedIds); setRelatedToAdd('');
  }, [document]);

  const related = relatedIds.map((id) => documents.find((item) => item.id === id)).filter((item): item is LibraryDocument => Boolean(item));

  return <aside className="detail-panel">
    <div className="detail-top"><span>{localize(language, '资料详情', 'Document details')}</span><div><button aria-label={localize(language, '删除资料', 'Delete document')} title={localize(language, '删除资料', 'Delete document')} onClick={onDelete}><Trash2 size={15} /></button><button aria-label={localize(language, '关闭详情', 'Close details')} onClick={onClose}><X size={16} /></button></div></div>
    <div className="detail-body">
      <div className={`detail-filemark ${document.kind === 'PDF' ? 'pdf' : 'link'}`}>{document.kind === 'PDF' ? <FileText size={21} /> : <Link2 size={21} />}</div>
      {editing ? <input className="title-edit" value={title} onChange={(event) => setTitle(event.target.value)} aria-label={localize(language, '资料标题', 'Document title')} /> : <h3>{localizePdfName(document.title, language)}</h3>}
      <div className="detail-type"><span>{document.kind}</span><i />{documentStatusLabel(document.status, language)}</div>
      {!editing && <button className="open-document" onClick={onOpen}>{document.kind === 'PDF' ? <BookOpen size={15} /> : <Link2 size={15} />}{document.kind === 'PDF' ? localize(language, '打开 PDF', 'Open PDF') : localize(language, '打开来源网页', 'Open source page')}<ArrowRight size={14} /></button>}
      <div className="detail-rule" />
      <div className="detail-fields">
        <div className="detail-field"><span>{localize(language, '分类', 'Category')}</span>{editing ? <select value={category} onChange={(event) => setCategory(event.target.value as Category)}>{categories.filter((item) => item !== '全部资料').map((item) => <option key={item} value={item}>{categoryLabel(item, language)}</option>)}</select> : <strong>{categoryLabel(document.category, language)}</strong>}</div>
        <div className="detail-field"><span>{localize(language, '加入日期', 'Added')}</span><strong>{formatDate(document.addedAt)}</strong></div>
        {document.kind === 'PDF' && <div className="detail-field"><span>{localize(language, '文件大小', 'File size')}</span><strong>{formatSize(document.fileSize)}</strong></div>}
        {document.kind === 'LINK' && <div className="detail-field"><span>{localize(language, '来源链接', 'Source link')}</span><strong className="url-value">{document.url}</strong></div>}
      </div>
      <div className="detail-rule" />
      <div className="detail-section-title"><span><Tag size={14} />{localize(language, '标签', 'Tags')}</span></div>
      {editing ? <input className="field-input" value={tags} onChange={(event) => setTags(event.target.value)} placeholder={localize(language, '用逗号分隔多个标签', 'Separate tags with commas')} /> : <div className="tag-list">{document.tags.length ? document.tags.map((tag) => <span key={tag}>{tag}</span>) : <small>{localize(language, '暂无标签', 'No tags')}</small>}</div>}
      <div className="detail-section-title notes-title"><span><FileText size={14} />{localize(language, '笔记', 'Notes')}</span></div>
      {editing ? <textarea className="notes-edit" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={localize(language, '记录冲洗条件、使用心得或关键页码', 'Record processing conditions, notes, or key pages')} /> : <p className="notes-copy">{document.notes || localize(language, '暂无笔记', 'No notes')}</p>}
      <div className="detail-section-title related-title"><span><Link2 size={14} />{localize(language, '关联资料', 'Related materials')}</span><button aria-label={localize(language, '添加关联', 'Add relation')} title={localize(language, '添加关联', 'Add relation')} onClick={onEdit}><Plus size={14} /></button></div>
      {editing && <div className="related-picker"><select aria-label={localize(language, '选择关联资料', 'Choose related material')} value={relatedToAdd} onChange={(event) => setRelatedToAdd(event.target.value)}><option value="">{localize(language, '选择资料', 'Choose material')}</option>{documents.filter((item) => item.id !== document.id && !relatedIds.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{localizePdfName(item.title, language)}</option>)}</select><button aria-label={localize(language, '确认添加关联', 'Confirm relation')} disabled={!relatedToAdd} onClick={() => { setRelatedIds((current) => [...current, relatedToAdd]); setRelatedToAdd(''); }}><Plus size={14} /></button></div>}
      {related.length ? related.map((item) => <div className="related-line" key={item.id}><button className="related-row" onClick={() => onRelated(item.id)}><FileText size={14} /><span>{localizePdfName(item.title, language)}</span><ChevronRight size={14} /></button>{editing && <button className="remove-related" aria-label={`${localize(language, '移除关联', 'Remove relation')} ${localizePdfName(item.title, language)}`} onClick={() => setRelatedIds((current) => current.filter((id) => id !== item.id))}><X size={13} /></button>}</div>) : <div className="related-empty">{localize(language, '暂未关联其他资料', 'No related materials')}</div>}
      <div className="detail-actions">{editing ? <><button className="secondary-button" onClick={onCancel}>{localize(language, '取消', 'Cancel')}</button><button className="primary-button" onClick={() => onSave({ title: title.trim() || document.title, category, tags: tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean), notes, relatedIds })}><Check size={14} />{localize(language, '保存修改', 'Save changes')}</button></> : <button className="secondary-button edit-button" onClick={onEdit}>{localize(language, '编辑资料', 'Edit document')}</button>}</div>
    </div>
  </aside>;
}

function PdfViewer({ source, onClose }: { source: PdfSource; onClose: () => void }) {
  const language = useAppLanguage();
  return <NativePdfViewer source={source} language={language} onClose={onClose} />;
}

export default App;

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText, HardDrive, LoaderCircle, Search, X } from 'lucide-react';
import type { PdfReaderBounds, PdfReaderSearchResult } from './types';

interface Props {
  source: { title: string; fileName: string; fileSize?: number; read: () => ReturnType<typeof window.library.readPdf> };
  language: 'zh' | 'en';
  onClose: () => void;
}

export function NativePdfViewer({ source, language, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<string | null>(null);
  const closeRef = useRef(onClose);
  const languageRef = useRef(language);
  const searchTimerRef = useRef<number | null>(null);
  const lastQueryRef = useRef('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<PdfReaderSearchResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<'success' | 'error' | null>(null);
  const messageTimerRef = useRef<number | null>(null);
  const t = (zh: string, en: string) => language === 'zh' ? zh : en;

  useEffect(() => { closeRef.current = onClose; languageRef.current = language; }, [language, onClose]);
  const getBounds = useCallback((): PdfReaderBounds => {
    const rect = hostRef.current?.getBoundingClientRect();
    return { x: rect?.left ?? 0, y: rect?.top ?? 0, width: rect?.width ?? 0, height: rect?.height ?? 0 };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let openedId: string | null = null;
    setLoading(true);
    setError(false);
    const open = async () => {
      const bytes = await source.read();
      if (cancelled) return;
      const opened = await window.library.openPdfReader({ bytes, fileName: `${source.title}.pdf`, language: languageRef.current, bounds: getBounds() });
      openedId = opened.sessionId;
      if (cancelled) {
        await window.library.closePdfReader(openedId);
        return;
      }
      sessionRef.current = openedId;
      setSessionId(openedId);
      await window.library.setPdfReaderBounds(openedId, getBounds());
      if (!cancelled) setLoading(false);
    };
    open().catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => {
      cancelled = true;
      sessionRef.current = null;
      if (openedId) window.library.closePdfReader(openedId).catch(() => {});
    };
  }, [getBounds, source]);

  useEffect(() => {
    let frame: number | null = null;
    const update = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (sessionRef.current) window.library.setPdfReaderBounds(sessionRef.current, getBounds()).catch(() => {});
      });
    };
    const observer = new ResizeObserver(update);
    if (hostRef.current) observer.observe(hostRef.current);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); if (frame !== null) cancelAnimationFrame(frame); };
  }, [getBounds]);

  useEffect(() => window.library.onPdfReaderSearch(next => {
    if (next.sessionId === sessionRef.current && next.query === lastQueryRef.current) setResult(next);
  }), []);

  useEffect(() => window.library.onPdfReaderCommand(event => {
    if (event.sessionId !== sessionRef.current) return;
    if (event.command === 'search') { searchRef.current?.focus(); searchRef.current?.select(); }
    else if (event.command === 'close') closeRef.current();
    else if (event.command === 'error') { setError(true); window.library.closePdfReader(event.sessionId).catch(() => {}); }
    else if (event.command === 'export-error') setExportMessage('error');
  }), []);

  const find = useCallback((text: string, forward = true, repeat = false) => {
    const id = sessionRef.current;
    if (!id) return;
    const normalized = text.trim();
    const findNext = repeat && lastQueryRef.current === normalized;
    lastQueryRef.current = normalized;
    if (!normalized) setResult(null);
    window.library.findPdfReader(id, normalized, { forward, findNext }).catch(() => {});
  }, []);
  useEffect(() => {
    searchTimerRef.current = window.setTimeout(() => find(query), 150);
    return () => { if (searchTimerRef.current !== null) window.clearTimeout(searchTimerRef.current); };
  }, [find, query, sessionId]);

  function handleSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (searchTimerRef.current !== null) window.clearTimeout(searchTimerRef.current);
      find(query, !event.shiftKey, true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (query) setQuery(''); else onClose();
    }
  }

  useEffect(() => {
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault(); searchRef.current?.focus(); searchRef.current?.select();
      } else if (event.key === 'Escape' && event.target !== searchRef.current) closeRef.current();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  async function exportPdf() {
    if (!sessionRef.current || exporting) return;
    setExporting(true);
    try {
      const output = await window.library.exportPdfReader(sessionRef.current);
      if (output) setExportMessage('success');
    } catch { setExportMessage('error'); }
    finally {
      setExporting(false);
      if (messageTimerRef.current !== null) window.clearTimeout(messageTimerRef.current);
      messageTimerRef.current = window.setTimeout(() => setExportMessage(null), 2400);
    }
  }
  useEffect(() => () => { if (messageTimerRef.current !== null) window.clearTimeout(messageTimerRef.current); }, []);

  const size = source.fileSize ? `${(source.fileSize / 1024 / 1024).toFixed(1)} MB` : '';
  return <div className="viewer-scrim"><div className="pdf-viewer native-pdf-viewer">
    <header className="viewer-header">
      <div className="viewer-doc"><div className="viewer-filemark"><FileText size={17} /></div><div><strong>{source.title}</strong><span>{t('Chromium PDF 阅读器', 'Chromium PDF reader')}</span></div></div>
      <div className="viewer-tools">
        <label className="viewer-search"><Search size={14} /><input ref={searchRef} value={query} disabled={loading || error} onChange={event => { setQuery(event.target.value); setResult(null); }} onKeyDown={handleSearchKey} placeholder={t('搜索 PDF', 'Search PDF')} aria-label={t('搜索 PDF 内容', 'Search PDF content')} />{query && <button title={t('清除搜索', 'Clear search')} aria-label={t('清除 PDF 搜索', 'Clear PDF search')} onClick={() => setQuery('')}><X size={13} /></button>}</label>
        {query && <span className="viewer-search-count" aria-live="polite">{result ? `${result.activeMatchOrdinal}/${result.matches}` : '…'}</span>}
        <button title={t('上一个匹配', 'Previous match')} aria-label={t('上一个匹配', 'Previous match')} disabled={!result?.matches} onClick={() => find(query, false, true)}><ChevronLeft size={15} /></button>
        <button title={t('下一个匹配', 'Next match')} aria-label={t('下一个匹配', 'Next match')} disabled={!result?.matches} onClick={() => find(query, true, true)}><ChevronRight size={15} /></button>
        <div className="viewer-tool-rule" />
        <button title={t('导出 PDF', 'Export PDF')} aria-label={t('导出 PDF', 'Export PDF')} disabled={loading || error || exporting} onClick={exportPdf}><Download size={16} /></button>
        <div className="viewer-tool-rule" /><button title={t('关闭阅读器', 'Close reader')} aria-label={t('关闭阅读器', 'Close reader')} onClick={onClose}><X size={17} /></button>
      </div>
    </header>
    <div className="native-pdf-host" ref={hostRef}>
      {loading && <div className="pdf-loading"><LoaderCircle size={20} className="spin" />{t('正在载入 PDF', 'Loading PDF')}</div>}
      {error && <div className="native-pdf-error">{t('无法打开 PDF，请关闭后重试。', 'Unable to open PDF. Close the reader and try again.')}</div>}
    </div>
    <footer className="viewer-footer"><span><HardDrive size={14} />{exportMessage === 'success' ? t('已导出', 'Exported') : exportMessage === 'error' ? t('导出失败', 'Export failed') : t('本地文件 · 离线阅读', 'Local file · offline reading')}</span><span>{size}</span></footer>
  </div></div>;
}

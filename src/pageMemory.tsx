import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

interface DisclosureMemory {
  isCollapsed: (key: string) => boolean;
  toggle: (key: string) => void;
}

const DisclosureContext = createContext<DisclosureMemory | null>(null);

// This provider lives for one app session. No navigation state is written to disk.
export function PageMemoryProvider({ children }: PropsWithChildren) {
  const [sections, setSections] = useState<Record<string, boolean>>({});
  const memory = useMemo<DisclosureMemory>(() => ({
    isCollapsed: key => sections[key] ?? true,
    toggle: key => setSections(previous => ({ ...previous, [key]: !(previous[key] ?? true) })),
  }), [sections]);
  return <DisclosureContext.Provider value={memory}>{children}</DisclosureContext.Provider>;
}

export function useDisclosureMemory() {
  const memory = useContext(DisclosureContext);
  if (!memory) throw new Error('Disclosure state requires PageMemoryProvider');
  return memory;
}

export function useSectionDisclosure(key: string) {
  const memory = useDisclosureMemory();
  return [memory.isCollapsed(key), () => memory.toggle(key)] as const;
}

export function usePageScroll(pageKey: string, ready: boolean) {
  const contentRef = useRef<HTMLElement>(null);
  const positions = useRef(new Map<string, number>());
  const activePage = useRef(pageKey);

  const rememberPosition = useCallback(() => {
    if (contentRef.current) positions.current.set(activePage.current, contentRef.current.scrollTop);
  }, []);

  useLayoutEffect(() => {
    activePage.current = pageKey;
    if (ready && contentRef.current) {
      // Restore after the target sections are rendered and before the browser paints.
      // Reading the departing DOM here would lose its position if the new page is shorter.
      contentRef.current.scrollTop = positions.current.get(pageKey) ?? 0;
    }
  }, [pageKey, ready]);

  return { contentRef, rememberPosition };
}

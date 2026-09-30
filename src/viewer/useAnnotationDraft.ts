import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { fetchDraft, saveDraft } from '../lib/index.js';

export type DraftStatus = 'idle' | 'saving' | 'saved' | 'error';

interface DraftPage {
  pageNumber: number;
  objects: unknown[];
}

// The slice of AnnotationCanvas.jsx's imperative handle this hook needs.
interface DraftCanvasHandle {
  getDraftPages: () => DraftPage[];
  restoreDraft: (pages: DraftPage[]) => Promise<boolean>;
}

interface LocalBackup {
  pages: DraftPage[];
  savedAt: number;
}

const SERVER_SAVE_DELAY_MS = 2000;
const LOCAL_SAVE_DELAY_MS = 400;
const RETRY_INTERVAL_MS = 15000;

function localKey(attachmentId: string): string {
  return `inkspace:draft:${attachmentId}`;
}

// localStorage can throw (quota, private mode) — a backup is best-effort.
function readLocal(attachmentId: string): LocalBackup | null {
  try {
    const raw = window.localStorage.getItem(localKey(attachmentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalBackup;
    return Array.isArray(parsed.pages) && typeof parsed.savedAt === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocal(attachmentId: string, pages: DraftPage[]): void {
  try {
    window.localStorage.setItem(localKey(attachmentId), JSON.stringify({ pages, savedAt: Date.now() }));
  } catch {
    /* quota/private mode: the server copy is the real one */
  }
}

function clearLocal(attachmentId: string): void {
  try {
    window.localStorage.removeItem(localKey(attachmentId));
  } catch {
    /* ignore */
  }
}

interface Options {
  attachmentId: string | undefined;
  // True once the document is loaded and the canvases can take a restore.
  ready: boolean;
  canvasRef: RefObject<DraftCanvasHandle | null>;
}

// Server-side autosave of in-progress annotations, with a localStorage copy as
// a bridge for the gap before the last save lands (tab closed, offline).
// localStorage only ever holds *unsynced* work: it's removed as soon as the
// server accepts a save, so a stale local copy can't shadow newer server data
// from another computer. On open: newest of (local unsynced, server) wins.
export function useAnnotationDraft({ attachmentId, ready, canvasRef }: Options) {
  const [status, setStatus] = useState<DraftStatus>('idle');
  const dirtyRef = useRef(false);
  const savingRef = useRef<Promise<boolean> | null>(null);
  const serverTimerRef = useRef<number | undefined>(undefined);
  const localTimerRef = useRef<number | undefined>(undefined);
  const restoredRef = useRef(false);

  const writeLocalNow = useCallback(() => {
    const canvas = canvasRef.current;
    if (!attachmentId || !canvas) return;
    writeLocal(attachmentId, canvas.getDraftPages());
  }, [attachmentId, canvasRef]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    const canvas = canvasRef.current;
    if (!attachmentId || !canvas) return true;
    if (savingRef.current) await savingRef.current;
    if (!dirtyRef.current) return true;

    window.clearTimeout(serverTimerRef.current);
    dirtyRef.current = false;
    setStatus('saving');
    const pages = canvas.getDraftPages();
    const attempt = saveDraft(attachmentId, pages)
      .then(() => {
        // Only drop the local copy if nothing changed while the request was in flight.
        if (!dirtyRef.current) clearLocal(attachmentId);
        setStatus('saved');
        return true;
      })
      .catch(() => {
        dirtyRef.current = true;
        setStatus('error');
        return false;
      })
      .finally(() => {
        savingRef.current = null;
      });
    savingRef.current = attempt;
    return attempt;
  }, [attachmentId, canvasRef]);

  // Call on every annotation change.
  const notifyChange = useCallback(() => {
    if (!attachmentId) return;
    dirtyRef.current = true;
    window.clearTimeout(localTimerRef.current);
    localTimerRef.current = window.setTimeout(writeLocalNow, LOCAL_SAVE_DELAY_MS);
    window.clearTimeout(serverTimerRef.current);
    serverTimerRef.current = window.setTimeout(() => void saveNow(), SERVER_SAVE_DELAY_MS);
  }, [attachmentId, saveNow, writeLocalNow]);

  // Restore once per opened attachment.
  useEffect(() => {
    restoredRef.current = false;
    setStatus('idle');
  }, [attachmentId]);

  useEffect(() => {
    if (!attachmentId || !ready || restoredRef.current) return undefined;
    restoredRef.current = true;
    let cancelled = false;

    (async () => {
      let serverPages: DraftPage[] = [];
      let serverUpdatedAt = 0;
      try {
        const draft = (await fetchDraft(attachmentId)) as { pages?: DraftPage[]; updatedAt?: string | null };
        serverPages = Array.isArray(draft.pages) ? draft.pages : [];
        serverUpdatedAt = draft.updatedAt ? Date.parse(draft.updatedAt) : 0;
      } catch {
        // Server unreachable: fall through to whatever the local copy has.
      }
      if (cancelled) return;

      const local = readLocal(attachmentId);
      const useLocal = local !== null && local.savedAt > serverUpdatedAt;
      const pages = useLocal ? local.pages : serverPages;
      if (pages.length === 0) return;

      const restored = await canvasRef.current?.restoreDraft(pages);
      if (restored && useLocal) {
        dirtyRef.current = true;
        void saveNow(); // push the newer local work up to the server
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attachmentId, ready, canvasRef, saveNow]);

  // Retry failed saves, and never lose the last edits to a closing tab.
  useEffect(() => {
    const retry = window.setInterval(() => {
      if (dirtyRef.current && !savingRef.current) void saveNow();
    }, RETRY_INTERVAL_MS);
    const onOnline = () => {
      if (dirtyRef.current) void saveNow();
    };
    const onLeave = () => {
      if (dirtyRef.current) writeLocalNow();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.clearInterval(retry);
      window.clearTimeout(serverTimerRef.current);
      window.clearTimeout(localTimerRef.current);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [saveNow, writeLocalNow]);

  // Resolves true when everything is on the server (or there was nothing to save).
  const flush = useCallback(async (): Promise<boolean> => {
    if (!dirtyRef.current && !savingRef.current) return true;
    if (dirtyRef.current) writeLocalNow();
    return saveNow();
  }, [saveNow, writeLocalNow]);

  return { status, notifyChange, flush };
}

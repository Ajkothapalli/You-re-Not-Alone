import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const KEY = '@yana/write_draft';

interface DraftCtx {
  draft:      string;
  setDraft:   (t: string) => void;
  clearDraft: () => void;
}

const Ctx = createContext<DraftCtx>({ draft: '', setDraft: () => {}, clearDraft: () => {} });

export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraftState] = useState('');

  // Restore from disk on first launch / after native restart
  useEffect(() => {
    AsyncStorage.getItem(KEY).then(v => { if (v) setDraftState(v); }).catch(() => {});
  }, []);

  const setDraft = useCallback((t: string) => {
    setDraftState(t);
    AsyncStorage.setItem(KEY, t).catch(() => {});
  }, []);

  const clearDraft = useCallback(() => {
    setDraftState('');
    AsyncStorage.removeItem(KEY).catch(() => {});
  }, []);

  /**
   * Memoized for the same reason as the theme value: an inline object gets a
   * new identity every render, and a changed context value re-renders every
   * consumer unconditionally — React.memo cannot stop it, because context is
   * not a prop.
   */
  const value = useMemo(
    () => ({ draft, setDraft, clearDraft }), [draft, setDraft, clearDraft]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useDraft = () => useContext(Ctx);

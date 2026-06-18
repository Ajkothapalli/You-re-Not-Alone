import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

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

  function setDraft(t: string) {
    setDraftState(t);
    AsyncStorage.setItem(KEY, t).catch(() => {});
  }

  function clearDraft() {
    setDraftState('');
    AsyncStorage.removeItem(KEY).catch(() => {});
  }

  return <Ctx.Provider value={{ draft, setDraft, clearDraft }}>{children}</Ctx.Provider>;
}

export const useDraft = () => useContext(Ctx);

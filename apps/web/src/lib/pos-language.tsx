'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { PosLanguage } from './pos-i18n';

const PosLanguageContext = createContext<PosLanguage>('en');

/** UI language belongs to the workspace, independently of microphone language. */
export function PosLanguageProvider({ language, children }: { language: PosLanguage; children: ReactNode }) {
  return <PosLanguageContext.Provider value={language}>{children}</PosLanguageContext.Provider>;
}

export function usePosLanguage(): PosLanguage {
  return useContext(PosLanguageContext);
}

export function uiText(language: PosLanguage, en: string, hi: string, hinglish: string): string {
  return language === 'hi' ? hi : language === 'hinglish' ? hinglish : en;
}

'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, Language } from '@/lib/i18n/translations';

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof translations['zh'];
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('zh');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 1. Check localStorage
    const savedLang = localStorage.getItem('language') as Language;
    if (savedLang && (savedLang === 'zh' || savedLang === 'en')) {
      setLanguageState(savedLang);
    } else {
      // 2. Check browser language
      const browserLang = navigator.language.toLowerCase();
      if (browserLang.startsWith('zh')) {
        setLanguageState('zh');
      } else {
        setLanguageState('en');
      }
    }
    setMounted(true);
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  };

  // Prevent hydration mismatch by rendering children only after mount or providing a default
  // However, for SEO and initial render, we might want to default to 'zh' but that causes mismatch if client is 'en'
  // A common pattern is to render, but if mismatch, React warns. 
  // To avoid flash of wrong language, we can use 'mounted' check, but that hurts SEO/LCP.
  // Given this is a client-side adaptation on an existing app, we accept the initial render might be ZH.
  
  const value = {
    language,
    setLanguage,
    t: translations[language]
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

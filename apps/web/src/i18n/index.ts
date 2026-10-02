import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { useCallback } from "react";
import type { Lang } from "@shomap/shared";
import en from "./en.json";
import bn from "./bn.json";

const LANG_KEY = "shomap.lang";

function storedLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === "bn" ? "bn" : "en";
  } catch {
    return "en";
  }
}

export function applyDocumentLang(lang: Lang) {
  document.documentElement.lang = lang;
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, bn: { translation: bn } },
  lng: storedLang(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnObjects: true,
});
applyDocumentLang(i18n.language as Lang);

export function setLanguage(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* storage may be unavailable; the switch still works for this session */
  }
  applyDocumentLang(lang);
  void i18n.changeLanguage(lang);
}

const numberFormats: Record<Lang, Intl.NumberFormat> = {
  en: new Intl.NumberFormat("en-US"),
  bn: new Intl.NumberFormat("bn-BD"),
};

type Named = { nameEn: string; nameBn: string };

/**
 * Translation helpers. Numbers passed as params are localised (১২৩ in Bangla, FR-13.3).
 */
export function useI18n() {
  const { t, i18n: inst } = useTranslation();
  const lang = (inst.language === "bn" ? "bn" : "en") as Lang;

  const n = useCallback((v: number) => numberFormats[lang].format(v), [lang]);
  const tt = useCallback(
    (key: string, params?: Record<string, unknown>) => {
      if (!params) return t(key) as string;
      const p: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(params)) p[k] = typeof v === "number" ? numberFormats[lang].format(v) : v;
      return t(key, p) as string;
    },
    [t, lang],
  );
  const name = useCallback((o: Named | undefined | null) => (o ? (lang === "bn" ? o.nameBn : o.nameEn) : ""), [lang]);
  const list = useCallback((key: string) => t(key, { returnObjects: true }) as unknown as string[], [t]);

  return { t: tt, lang, n, name, list, setLang: setLanguage };
}

export default i18n;

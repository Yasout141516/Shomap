import { DHAKA_OFFSET_MS, type Lang } from "@shomap/shared";
import { serverNow } from "./clock";

const rtf: Record<Lang, Intl.RelativeTimeFormat> = {
  en: new Intl.RelativeTimeFormat("en", { numeric: "auto" }),
  bn: new Intl.RelativeTimeFormat("bn", { numeric: "auto" }),
};

/** "5 minutes ago" / "৫ মিনিট আগে". */
export function relTime(iso: string, lang: Lang, nowMs = serverNow()): string {
  const diffS = Math.round((Date.parse(iso) - nowMs) / 1000);
  const abs = Math.abs(diffS);
  if (abs < 45) return rtf[lang].format(0, "second");
  if (abs < 3600) return rtf[lang].format(Math.round(diffS / 60), "minute");
  if (abs < 86400) return rtf[lang].format(Math.round(diffS / 3600), "hour");
  return rtf[lang].format(Math.round(diffS / 86400), "day");
}

/** "42 min" style duration for authority timers. */
export function duration(fromIso: string, lang: Lang, nowMs = serverNow()): string {
  const mins = Math.max(0, Math.round((nowMs - Date.parse(fromIso)) / 60000));
  const nf = new Intl.NumberFormat(lang === "bn" ? "bn-BD" : "en-US");
  if (mins < 60) return lang === "bn" ? `${nf.format(mins)} মিনিট` : `${nf.format(mins)} min`;
  const h = Math.floor(mins / 60);
  if (h < 48) return lang === "bn" ? `${nf.format(h)} ঘণ্টা` : `${nf.format(h)} h`;
  const d = Math.floor(h / 24);
  return lang === "bn" ? `${nf.format(d)} দিন` : `${nf.format(d)} d`;
}

export function dateTime(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Dhaka",
  }).format(new Date(iso));
}

export function shortDate(isoDate: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

/** Value for <input type="datetime-local"> in Dhaka time. */
export function toLocalInput(d: Date): string {
  const dhaka = new Date(d.getTime() + DHAKA_OFFSET_MS);
  return dhaka.toISOString().slice(0, 16);
}
/** ISO string for a datetime-local value, or null when the input is empty or invalid. */
export function fromLocalInput(v: string): string | null {
  const ms = Date.parse(`${v}:00Z`);
  return Number.isNaN(ms) ? null : new Date(ms - DHAKA_OFFSET_MS).toISOString();
}

/** "You" / "You · hidden from public" / the name / "Anonymous" for a reporter or commenter. */
export function identityLabel(p: { isYou: boolean; isAnonymous: boolean; name: string | null }, t: (k: string) => string): string {
  if (p.isYou) return t(p.isAnonymous ? "common.youHidden" : "common.you");
  return p.name ?? t("common.anonymous");
}

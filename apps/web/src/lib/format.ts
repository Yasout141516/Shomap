import type { Lang } from "@shomap/shared";

const rtf: Record<Lang, Intl.RelativeTimeFormat> = {
  en: new Intl.RelativeTimeFormat("en", { numeric: "auto" }),
  bn: new Intl.RelativeTimeFormat("bn", { numeric: "auto" }),
};

/** "5 minutes ago" / "৫ মিনিট আগে". */
export function relTime(iso: string, lang: Lang, nowMs = Date.now()): string {
  const diffS = Math.round((Date.parse(iso) - nowMs) / 1000);
  const abs = Math.abs(diffS);
  if (abs < 45) return rtf[lang].format(0, "second");
  if (abs < 3600) return rtf[lang].format(Math.round(diffS / 60), "minute");
  if (abs < 86400) return rtf[lang].format(Math.round(diffS / 3600), "hour");
  return rtf[lang].format(Math.round(diffS / 86400), "day");
}

/** "42 min" style duration for authority timers. */
export function duration(fromIso: string, lang: Lang, nowMs = Date.now()): string {
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
  const dhaka = new Date(d.getTime() + 6 * 3600_000);
  return dhaka.toISOString().slice(0, 16);
}
export function fromLocalInput(v: string): string {
  return new Date(Date.parse(`${v}:00Z`) - 6 * 3600_000).toISOString();
}

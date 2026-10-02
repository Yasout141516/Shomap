import type { Urgency, Verification } from "@shomap/shared";

/** PRD §12.2: urgency = colour + shape + label; verification = outline. */
export const URGENCY_COLOR: Record<Urgency, string> = {
  low: "#6B7F99",
  medium: "#C98A00",
  high: "#D9560B",
  critical: "#F42A41",
};

const SHAPES: Record<Urgency, string> = {
  low: '<circle cx="18" cy="18" r="12"/>',
  medium: '<rect x="6.5" y="6.5" width="23" height="23" rx="5"/>',
  high: '<path d="M18 4.5 L31.5 29.5 H4.5 Z" stroke-linejoin="round"/>',
  critical: '<polygon points="12.5,4.5 23.5,4.5 31.5,12.5 31.5,23.5 23.5,31.5 12.5,31.5 4.5,23.5 4.5,12.5"/>',
};

/** Full pin SVG markup. The category glyph is centred inside the shape. */
export function pinSvg(urgency: Urgency, verification: Verification, glyphSvg: string, size = 36): string {
  const dash = verification === "unverified" ? ' stroke-dasharray="3.5 2.5"' : "";
  const glyphY = urgency === "high" ? 13 : 11;
  const check =
    verification === "verified"
      ? '<g transform="translate(24 0)"><circle cx="6" cy="6" r="6" fill="#006A4E" stroke="#fff" stroke-width="1.5"/><path d="M3.3 6.2 L5.3 8.1 L8.8 4.3" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g>'
      : "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 36 36" aria-hidden="true"><g fill="${URGENCY_COLOR[urgency]}" stroke="#1F2421" stroke-width="1.6"${dash}>${SHAPES[urgency]}</g><g transform="translate(11 ${glyphY})">${glyphSvg}</g>${check}</svg>`;
}

/** Small standalone shape for legends and badges. */
export function shapeSvg(urgency: Urgency, size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 36 36" aria-hidden="true"><g fill="${URGENCY_COLOR[urgency]}" stroke="#1F2421" stroke-width="2">${SHAPES[urgency]}</g></svg>`;
}

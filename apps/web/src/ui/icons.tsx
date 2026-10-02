import { renderToStaticMarkup } from "react-dom/server";
import {
  Baby,
  BadgeDollarSign,
  CircleHelp,
  Construction,
  Hand,
  HeartHandshake,
  ShieldAlert,
  Siren,
  Store,
  TrafficCone,
  Trash2,
  Wallet,
  Waves,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "hand-grab": Hand,
  wallet: Wallet,
  "badge-dollar": BadgeDollarSign,
  "shield-alert": ShieldAlert,
  baby: Baby,
  "traffic-cone": TrafficCone,
  store: Store,
  trash: Trash2,
  waves: Waves,
  construction: Construction,
  "circle-help": CircleHelp,
  siren: Siren,
  "heart-handshake": HeartHandshake,
};

export function CategoryIcon({ icon, ...props }: { icon: string } & LucideProps) {
  const C = ICONS[icon] ?? CircleHelp;
  return <C aria-hidden="true" {...props} />;
}

const svgCache = new Map<string, string>();
/** Inner SVG markup for a category glyph, for map pins built as plain DOM. */
export function categoryIconSvg(icon: string, size = 14, color = "#fff"): string {
  const key = `${icon}|${size}|${color}`;
  let svg = svgCache.get(key);
  if (!svg) {
    svg = renderToStaticMarkup(<CategoryIcon icon={icon} size={size} color={color} strokeWidth={2.4} />);
    svgCache.set(key, svg);
  }
  return svg;
}

import type { EventKind } from "@shomap/shared";

/** i18n key for a timeline entry: the first status entry is "Reported", the rest are `events.<kind>.<to>`. */
export function eventLabelKey(e: { kind: EventKind; fromStatus?: string | null; toStatus: string }): string {
  if (e.kind === "status" && e.toStatus === "open" && !e.fromStatus) return "events.reported";
  return `events.${e.kind}.${e.toStatus}`;
}

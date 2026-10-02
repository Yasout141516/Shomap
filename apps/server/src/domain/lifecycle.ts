import type { Status } from "@shomap/shared";

/** Who is causing a transition. `community` = the 3-vote "still happening" reopen. */
export type Actor = "citizen" | "authority" | "admin" | "system" | "community";

type Edge = `${Status}>${Status}`;

/** The state machine from PRD diagram 03. */
const EDGES: Record<Edge, Actor[]> = {
  "open>referred": ["system", "admin"],
  "open>removed": ["admin", "system"],
  "referred>acknowledged": ["authority"],
  "referred>open": ["authority", "admin"],
  "referred>removed": ["admin"],
  "acknowledged>in_progress": ["authority"],
  "acknowledged>resolved": ["authority"],
  "acknowledged>removed": ["admin"],
  "in_progress>resolved": ["authority"],
  "in_progress>removed": ["admin"],
  "resolved>closed": ["system"],
  "resolved>in_progress": ["community"],
  "resolved>removed": ["admin"],
} as Record<Edge, Actor[]>;

export function canTransition(from: Status, to: Status, actor: Actor): boolean {
  return EDGES[`${from}>${to}` as Edge]?.includes(actor) ?? false;
}

import type { Verification } from "@shomap/shared";
import type { DomainConfig } from "../config.js";

export interface VoteCounts {
  confirms: number;
  disputes: number;
  current: Verification;
}

/**
 * PRD FR-3.2 / FR-3.3.
 * Verified: confirms ≥ threshold and confirms ≥ 2 × disputes.
 * Disputed: disputes ≥ threshold and disputes > confirms.
 * Once verified (by votes or by an admin), an incident stays verified unless the dispute rule fires.
 */
export function evaluateVerification(
  { confirms, disputes, current }: VoteCounts,
  cfg: Pick<DomainConfig, "confirmThreshold" | "disputeThreshold">,
): Verification {
  if (disputes >= cfg.disputeThreshold && disputes > confirms) return "disputed";
  if (confirms >= cfg.confirmThreshold && confirms >= 2 * disputes) return "verified";
  if (current === "verified") return "verified";
  return "unverified";
}

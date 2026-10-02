import type { CommentDTO, Role } from "@shomap/shared";
import type { CommentRow, ReferralRow } from "../db/schema.js";
import { isPrivileged, type Viewer } from "./incident.js";

export interface CommentAuthor {
  id: string;
  displayName: string;
  role: Role;
  authorityId: string | null;
}

/** Anonymous comments follow the same rule as anonymous reports. */
export function serializeComment(
  c: CommentRow,
  author: CommentAuthor,
  viewer: Viewer,
  referral: ReferralRow | null,
): CommentDTO {
  const isYou = !!viewer && viewer.id === c.authorId;
  const showAuthor = !c.isAnonymous || isYou || isPrivileged(viewer, referral);
  return {
    id: c.id,
    incidentId: c.incidentId,
    parentId: c.parentId,
    kind: c.kind,
    body: c.body,
    isAnonymous: c.isAnonymous,
    author: showAuthor ? { id: author.id, displayName: author.displayName } : null,
    authorIsYou: isYou,
    authorRole: author.role,
    authorityId: author.role === "authority" ? author.authorityId : null,
    lat: c.lat,
    lng: c.lng,
    createdAt: c.createdAt,
  };
}

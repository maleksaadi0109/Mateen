export type TeacherProfileStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "needs_information"
  | "rejected";

export interface TeacherProfileSnapshot {
  status: TeacherProfileStatus;
  revision: number;
  biography: string;
  specialties: string;
  available: boolean;
}

export interface TeacherProfileInput {
  biography: string;
  specialties: string;
  available: boolean;
}

export function teacherProfileSaveTransition(
  current: TeacherProfileSnapshot,
  next: TeacherProfileInput,
) {
  const unchangedReviewContent =
    current.biography === next.biography &&
    current.specialties === next.specialties;
  const availabilityOnlyChange =
    current.status === "approved" && unchangedReviewContent;

  return {
    status: availabilityOnlyChange ? "approved" : "draft",
    legacyStatus: availabilityOnlyChange ? "approved" : "draft",
    revision: availabilityOnlyChange ? current.revision : current.revision + 1,
    available: availabilityOnlyChange ? next.available : false,
    preserveApproval: availabilityOnlyChange,
    invalidateSubmission: current.status === "pending_review",
    revokeApproval: current.status === "approved" && !availabilityOnlyChange,
  } as const;
}
export interface PracticeRecitationRecordView {
  id: string;
  textId: string;
  hadithNumber: number;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  error: string | null;
  result: unknown;
  audioDeleted: boolean;
}

export function toPracticeRecitation(row: PracticeRecitationRecordView) {
  return {
    id: row.id,
    textId: row.textId,
    hadithNumber: row.hadithNumber,
    status: row.status,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    error: row.status === "deleted" ? null : row.error,
    result: row.status === "deleted" ? null : row.result,
    audioDeleted: row.audioDeleted,
  };
}
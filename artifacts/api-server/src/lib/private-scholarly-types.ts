// Structural types only. No private source text, scan, checksum or permission claim.
export interface EvidencePage {
  viewerPage: number;
  pdfPage: number;
  printedPage: string;
  imageFile: string;
  imageSha256: string;
  basis: string;
}

export interface ExcerptEvidence extends EvidencePage {
  pdfSha256: string;
  pdfUrl: string;
  location: string;
}

export interface Correction {
  id: string;
  passageId: string;
  before: string;
  after: string;
  pdfPage: number;
  location: string;
  reason: string;
  originalStart: number;
  originalEnd: number;
  beforeSha256: string;
  afterSha256: string;
  evidence: ExcerptEvidence;
}

export interface PreparedPassage {
  id: string;
  text: string;
  sourceUrl: string;
  viewerPage: number;
  printedPage: string | null;
  pdfPage: number | null;
  volume: null;
  startOffset: number;
  endOffset: number;
  textSha256: string;
  reviewStatus: string;
  indexed: boolean;
  transcriptionStatus: string;
  studentEligible: boolean;
  exclusionReason: string;
  correctedDraft: string | null;
  correctedDraftSha256?: string;
  corrections: Correction[];
  pageEvidence?: EvidencePage;
}

export interface QuoteCandidate {
  id: string;
  passageId: string;
  originalText: string;
  text: string;
  pdfPage: number;
  location: string;
  difference: string;
  scope: string;
  originalStart: number;
  originalEnd: number;
  originalTextSha256: string;
  textSha256: string;
  changes: { originalStart: number; originalEnd: number; before: string; after: string }[];
  evidence: ExcerptEvidence;
  sourceUrl: string;
  transcriptionStatus: string;
  reviewStatus: string;
  scientificApproval: null;
  studentEligible: boolean;
  indexed: boolean;
}

export interface PackageEvidence {
  pdfFile: string;
  pdfSha256: string;
  pdfPages: number;
  identityImageFile: string;
  identityImageSha256: string;
  viewerTotalPages: number;
  sourcePageUrl: string;
  pdfUrl: string;
  identityBasis: string;
  edition: null;
  paginationNote: string;
}

export interface Prepared {
  format: string;
  source: {
    title: string;
    author: string;
    textId: string;
    sourceUrl: string;
    textDownloadUrl: string;
    edition: string;
    version: string;
    status: string;
    authorizationStatement: string;
    authorizationStatementKind: string;
    scientificApproval: null;
    rawTextSha256: string;
    pageHtmlSha256: string;
    totalViewerPages: number;
    includedViewerPages: number[];
    excludedViewerPages: number[];
    warnings: string[];
    publicationStatus: string;
    collationStatus: string;
    collationEvidence: PackageEvidence;
    collationLimitations: string[];
    collationSummary: {
      originalPassages: number;
      excludedOriginalPassages: number;
      visuallyComparedCandidates: number;
      corrections: number;
      inspectedViewerPages: number[];
      studentEligible: number;
    };
  };
  passages: PreparedPassage[];
  quoteCandidates: QuoteCandidate[];
}

export interface Collation {
  format: string;
  rawTextSha256: string;
  method: string;
  scientificApproval: null;
  evidence: PackageEvidence;
  pages: EvidencePage[];
  corrections: Pick<Correction, 'id' | 'passageId' | 'before' | 'after' | 'pdfPage' | 'location' | 'reason'>[];
  candidates: Pick<QuoteCandidate, 'id' | 'passageId' | 'originalText' | 'text' | 'pdfPage' | 'location' | 'difference' | 'scope'>[];
  exclusions: { passageId: string; reason: string }[];
  defaultExclusionReason: string;
  limitations: string[];
}

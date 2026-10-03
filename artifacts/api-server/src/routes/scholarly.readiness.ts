import {
  GetMateenAssistantReadinessResponse,
} from "@workspace/api-zod";
import {
  db,
  scholarlyEvaluationsTable,
  scholarlyPassagesTable,
  scholarlyRuntimeConfigTable,
  scholarlySourcesTable,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import {
  corpusDigest,
  isScholarlyProviderConfigured,
  SCHOLARLY_MODEL,
  type PassageCandidate,
  type ScholarlyModel,
  SUPPORTED_SCHOLARLY_MODELS,
} from "../lib/scholarly";

const knownModels = new Set<string>(SUPPORTED_SCHOLARLY_MODELS);

function validModel(value: string): value is ScholarlyModel {
  return knownModels.has(value);
}

export async function currentScholarlyModel(): Promise<ScholarlyModel> {
  const [setting] = await db.select().from(scholarlyRuntimeConfigTable)
    .where(eq(scholarlyRuntimeConfigTable.id, 1)).limit(1);
  return setting && validModel(setting.model) ? setting.model : SCHOLARLY_MODEL;
}

export async function getScholarlyCorpus(): Promise<{
  passages: PassageCandidate[];
  hash: string;
  complete: boolean;
}> {
  const rows = await db.select({
    id: scholarlyPassagesTable.id,
    sourceId: scholarlySourcesTable.id,
    text: scholarlyPassagesTable.text,
    title: scholarlySourcesTable.title,
    author: scholarlySourcesTable.author,
    edition: scholarlySourcesTable.edition,
    publisher: scholarlySourcesTable.publisher,
    legalAuthorization: scholarlySourcesTable.legalAuthorization,
    authorizationReference: scholarlySourcesTable.authorizationReference,
    version: scholarlySourcesTable.version,
    volume: scholarlyPassagesTable.volume,
    printedPage: scholarlyPassagesTable.printedPage,
    pdfPage: scholarlyPassagesTable.pdfPage,
  }).from(scholarlyPassagesTable)
    .innerJoin(scholarlySourcesTable, eq(scholarlyPassagesTable.sourceId, scholarlySourcesTable.id))
    .where(and(eq(scholarlyPassagesTable.indexed, true), eq(scholarlySourcesTable.status, "indexed")))
    .orderBy(scholarlySourcesTable.id, scholarlyPassagesTable.id)
    .limit(5001);
  const complete = rows.length <= 5000;
  const boundedRows = rows.slice(0, 5000);
  const digestRows = boundedRows.map((row) => ({
    id: row.id,
    sourceId: row.sourceId,
    text: row.text,
    title: row.title,
    author: row.author,
    edition: row.edition,
    publisher: row.publisher,
    legalAuthorization: row.legalAuthorization,
    authorizationReference: row.authorizationReference,
    version: row.version,
    volume: row.volume,
    printedPage: row.printedPage,
    pdfPage: row.pdfPage,
  }));
  return {
    passages: boundedRows,
    hash: corpusDigest(digestRows),
    complete,
  };
}

export async function getScholarlyReadiness() {
  const corpus = await getScholarlyCorpus();
  const model = await currentScholarlyModel();
  const [evaluation] = await db.select().from(scholarlyEvaluationsTable)
    .orderBy(desc(scholarlyEvaluationsTable.createdAt)).limit(1);
  const evaluationPassed = Boolean(
    evaluation &&
    evaluation.model === model &&
    evaluation.corpusHash === corpus.hash &&
    evaluation.serverRunPassed &&
    evaluation.arabicQualityPassed &&
    evaluation.groundingPassed &&
    evaluation.abstentionPassed,
  );
  const sourceIds = new Set(corpus.passages.map((passage) => passage.sourceId));
  return {
    model,
    corpus,
    providerConfigured: isScholarlyProviderConfigured(model),
    evaluationPassed,
    reviewedSourceCount: sourceIds.size,
    assistantEnabled: evaluationPassed && sourceIds.size > 0 && corpus.complete &&
      isScholarlyProviderConfigured(model),
  };
}

export async function getMateenScholarlyReadiness() {
  const state = await getScholarlyReadiness();
  return GetMateenAssistantReadinessResponse.parse({
    model: state.model,
    providerConfigured: state.providerConfigured,
    evaluationPassed: state.evaluationPassed,
    reviewedSourceCount: state.reviewedSourceCount,
    assistantEnabled: state.assistantEnabled,
    studyAnswersEnabled: state.providerConfigured,
  });
}
import { Readable } from 'node:stream';
// Temporary route-test bundle only; cannot read or mutate any real object.
export class QualificationRejectedError extends Error {}
const unavailable = async () => { throw new Error('Storage operation outside this fixture'); };
export const discardQualificationObject = unavailable;
export const createQualificationUpload = unavailable;
export const validateAndPromoteQualification = unavailable;
export async function streamQualificationObject(path: string) {
  if (path !== 'disposable/not-stored') throw new Error('Not a fixture object');
  return Readable.from(['%PDF-1.4\n% isolated fixture, not a certificate\n%%EOF']);
}

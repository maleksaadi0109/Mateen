/** Only known review routes can be a forced sign-in destination. */
const reviewPaths = new Set(['/admin', '/admin/teachers', '/admin/sources', '/admin/scholarly', '/admin/audit', '/admin/assessments']);
export function reviewReturn(path: string, base = '') {
  return `${base}${reviewPaths.has(path) ? path : '/admin/teachers'}`;
}
export function reviewSignIn(path: string, base = '') {
  return `${base}/sign-in?reviewReturn=${encodeURIComponent(reviewReturn(path))}`;
}

export type RequestedAnalysis = 'plagiarism' | 'both';

export const ORIGINAL_UPLOAD_MAX_MB = 20;
export const ORIGINAL_UPLOAD_MAX_BYTES = ORIGINAL_UPLOAD_MAX_MB * 1024 * 1024;

export const RESULTS_UPLOAD_MAX_MB = 20;
export const RESULTS_UPLOAD_MAX_BYTES = RESULTS_UPLOAD_MAX_MB * 1024 * 1024;

export function requiresAiReport(requestedAnalysis: RequestedAnalysis): boolean {
  return requestedAnalysis === 'both';
}

/**
 * Burn-in: merge timestamp / watermark onto exported asset.
 */

export async function applyBurnIn({ attachmentId, timestamp, watermarkText }) {
  // TODO: render annotations + timestamp onto PDF/image buffer
  return {
    attachmentId,
    burnedAt: timestamp ?? new Date().toISOString(),
    watermark: watermarkText ?? 'Brand You',
    outputPath: null,
  };
}

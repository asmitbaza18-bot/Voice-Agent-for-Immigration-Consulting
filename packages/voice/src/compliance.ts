import type { VendorCompliance } from './types.js';

export class VendorComplianceError extends Error {
  override name = 'VendorComplianceError';
}

/**
 * Guardrail 9. Call at startup for every configured adapter; refuse to boot
 * if a vendor lacks no-training terms or processes data outside the US.
 */
export function assertVendorCompliant(c: VendorCompliance): void {
  const problems: string[] = [];
  if (!c.noTrainingOnCustomerData) problems.push('no-training terms not confirmed');
  if (c.dataRegion !== 'us') problems.push(`data region is ${c.dataRegion}, must be us`);
  if (!c.termsRef.trim()) problems.push('missing reference to signed terms');
  if (problems.length) throw new VendorComplianceError(`Vendor ${c.vendor} is not allowed: ${problems.join('; ')}`);
}

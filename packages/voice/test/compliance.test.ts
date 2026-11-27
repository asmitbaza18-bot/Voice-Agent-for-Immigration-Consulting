import { describe, expect, it } from 'vitest';
import { assertVendorCompliant, VendorComplianceError, type VendorCompliance } from '../src/index.js';

const ok: VendorCompliance = { vendor: 'example', noTrainingOnCustomerData: true, dataRegion: 'us', termsRef: 'DPA-2026-01' };

describe('assertVendorCompliant (guardrail 9)', () => {
  it('accepts a US-region vendor with no-training terms', () => {
    expect(() => assertVendorCompliant(ok)).not.toThrow();
  });
  it.each<[string, Partial<VendorCompliance>]>([
    ['training allowed', { noTrainingOnCustomerData: false }],
    ['non-US region', { dataRegion: 'eu' }],
    ['no terms reference', { termsRef: ' ' }],
  ])('rejects %s', (_l, patch) => {
    expect(() => assertVendorCompliant({ ...ok, ...patch })).toThrow(VendorComplianceError);
  });
});

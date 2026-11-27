import type { FieldValue } from '@chhetry/shared';
import type { RuleInput } from './types.js';

/** Typed, read-only accessors over intake answers. Missing or "discuss with attorney" reads as undefined unless asked. */
export class Facts {
  constructor(private readonly input: RuleInput) {}

  raw(module: string, field: string): FieldValue | undefined {
    return this.input.modules[module]?.[field];
  }

  isDiscuss(module: string, field: string): boolean {
    const v = this.raw(module, field);
    return typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'discuss_with_attorney';
  }

  bool(module: string, field: string): boolean | undefined {
    const v = this.raw(module, field);
    return typeof v === 'boolean' ? v : undefined;
  }

  str(module: string, field: string): string | undefined {
    const v = this.raw(module, field);
    return typeof v === 'string' ? v : undefined;
  }

  num(module: string, field: string): number | undefined {
    const v = this.raw(module, field);
    return typeof v === 'number' ? v : undefined;
  }

  numbers(module: string, field: string): number[] {
    const v = this.raw(module, field);
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
  }

  date(module: string, field: string): string | undefined {
    const v = this.raw(module, field);
    return typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'date' ? v.value : undefined;
  }

  get goal() {
    return this.input.goal;
  }

  get notices() {
    return this.input.notices ?? [];
  }
}

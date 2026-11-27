import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Bump when prompts/system.md changes. Stamped in the audit log for every AI output. */
export const PROMPT_VERSION = '2026-11-27.draft-1';

const here = fileURLToPath(new URL('../prompts/system.md', import.meta.url));

/** The attorney-reviewed system prompt, with the review comment stripped. */
export const SYSTEM_PROMPT: string = readFileSync(here, 'utf8').replace(/<!--[\s\S]*?-->\s*/, '').trim();

export const NOT_IN_FILE = 'NOT_IN_FILE';
export const NEEDS_ATTORNEY = 'NEEDS_ATTORNEY';

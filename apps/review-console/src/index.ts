import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Minimal attorney review console (Milestone 1). A static page plus one
 * script, served by the API at /console. It talks only to the /v1/review
 * endpoints with the attorney's bearer token. Staff-facing and English-only
 * for now; it moves into the mobile/web app with i18n later.
 */
const read = (f: string) => readFileSync(fileURLToPath(new URL(`../public/${f}`, import.meta.url)), 'utf8');

export const CONSOLE_FILES = {
  html: read('index.html'),
  js: read('app.js'),
} as const;

/** Strict CSP: no inline script, no third-party origins. */
export const CONSOLE_CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

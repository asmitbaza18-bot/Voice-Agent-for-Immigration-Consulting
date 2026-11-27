/**
 * Local dev server. In-memory everything, ephemeral keys, dev tokens printed once.
 * Run: pnpm --filter @chhetry/api dev   (uses tsx)
 * Set ANTHROPIC_API_KEY to answer with Claude; without it the template answerer is used.
 */
import { randomBytes } from 'node:crypto';
import { AnthropicLlmAdapter, buildDevApp } from './index.js';

if (process.env.NODE_ENV === 'production') throw new Error('server.ts is the dev server; do not run it in production');

const tok = () => randomBytes(18).toString('base64url');
const tokens = {
  [tok()]: { id: 'atty_chhetry', role: 'attorney' as const },
  [tok()]: { id: 'usr_sita', role: 'client' as const, personId: 'per_sita_sharma' },
  [tok()]: { id: 'usr_ram', role: 'client' as const, personId: 'per_ram_sharma' },
  [tok()]: { id: 'stf_1', role: 'staff' as const },
};

const { app } = await buildDevApp({ tokens, ...(process.env.ANTHROPIC_API_KEY ? { llm: new AnthropicLlmAdapter() } : {}) });
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '127.0.0.1' });
process.stdout.write(`API on http://127.0.0.1:${port}  console: /console\nDev tokens (this run only):\n`);
for (const [t, p] of Object.entries(tokens)) process.stdout.write(`  ${p.role.padEnd(9)} ${p.id.padEnd(14)} ${t}\n`);

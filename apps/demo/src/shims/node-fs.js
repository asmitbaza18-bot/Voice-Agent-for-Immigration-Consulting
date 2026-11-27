// Browser-only: the agent reads prompts/system.md at load time. The build inlines it here.
import systemPrompt from '../../../../packages/agent/prompts/system.md';
export function readFileSync(path) {
  if (String(path).endsWith('system.md')) return systemPrompt;
  throw new Error(`demo fs: ${path} is not bundled`);
}

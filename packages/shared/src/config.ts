/**
 * Reads a required environment variable. Throws with the variable name only,
 * never the value, so a misconfiguration cannot leak a secret into logs.
 */
export function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const v = env[name];
  if (v === undefined || v === '') throw new Error(`Missing required environment variable ${name}`);
  return v;
}

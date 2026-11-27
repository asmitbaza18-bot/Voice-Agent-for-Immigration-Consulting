import { redact, redactString } from './redact.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogSink = (line: string) => void;

export interface LoggerOptions {
  level?: LogLevel;
  /** Defaults to stdout. Tests pass an array-backed sink. */
  sink?: LogSink;
  /** Fields added to every line. Also redacted. */
  base?: Record<string, unknown>;
  now?: () => Date;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(base: Record<string, unknown>): Logger;
}

/**
 * JSON-lines logger that redacts every message and field before it leaves the
 * process. There is deliberately no "raw" escape hatch: if something must be
 * kept, it goes to the audit log, not the application log.
 */
export function createLogger(opts: LoggerOptions = {}): Logger {
  const level = opts.level ?? 'info';
  const sink: LogSink = opts.sink ?? ((line) => process.stdout.write(line + '\n'));
  const base = opts.base ?? {};
  const now = opts.now ?? (() => new Date());

  const write = (lvl: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[lvl] < ORDER[level]) return;
    const payload = redact({ ...base, ...(fields ?? {}) }) as Record<string, unknown>;
    sink(JSON.stringify({ time: now().toISOString(), level: lvl, msg: redactString(msg), ...payload }));
  };

  return {
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
    child: (b) => createLogger({ ...opts, base: { ...base, ...b } }),
  };
}

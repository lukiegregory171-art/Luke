/**
 * Minimal structured logger: one JSON object per line (level, time, event, and
 * arbitrary fields), so logs are greppable and machine-parseable in deployment.
 */

type Level = 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

function emit(level: Level, event: string, fields: Fields = {}): void {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields?: Fields) => emit('info', event, fields),
  warn: (event: string, fields?: Fields) => emit('warn', event, fields),
  error: (event: string, fields?: Fields) => emit('error', event, fields),
};

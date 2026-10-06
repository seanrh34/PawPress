const MIN_SECRET_LENGTH = 8;

export function createRedactor(secrets: string[]): (text: string) => string {
  const list = Array.from(new Set(secrets.filter((s) => s.length >= MIN_SECRET_LENGTH))).sort(
    (a, b) => b.length - a.length,
  );
  if (list.length === 0) return (text) => text;
  return (text) => {
    let out = text;
    for (const secret of list) out = out.split(secret).join('[REDACTED]');
    return out;
  };
}

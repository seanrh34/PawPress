import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface ParsedDocument {
  data: Record<string, unknown>;
  body: string;
  hasFrontMatter: boolean;
}

const FENCE = '---';

export function parseFrontMatter(input: string): ParsedDocument {
  const text = input.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const lines = text.split('\n');
  if ((lines[0] ?? '').trimEnd() !== FENCE) {
    return { data: {}, body: text, hasFrontMatter: false };
  }

  const yamlLines: string[] = [];
  let index = 1;
  let closed = false;
  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trimEnd() === FENCE) {
      closed = true;
      index += 1;
      break;
    }
    yamlLines.push(line);
  }
  if (!closed) {
    return { data: {}, body: text, hasFrontMatter: false };
  }

  const yamlText = yamlLines.join('\n');
  let data: unknown = {};
  if (yamlText.trim()) {
    try {
      data = parseYaml(yamlText);
    } catch {
      data = {};
    }
  }
  return {
    data: isRecord(data) ? data : {},
    body: lines.slice(index).join('\n'),
    hasFrontMatter: true,
  };
}

export function serializeFrontMatter(data: Record<string, unknown>, body: string): string {
  const yaml = stringifyYaml(data);
  return `${FENCE}\n${yaml}${FENCE}\n${body}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

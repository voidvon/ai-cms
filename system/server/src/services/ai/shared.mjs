export function normalizeText(value) {
  return String(value || '').trim();
}

export function extractJsonString(value) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return '';
    }
  }

  return '';
}

export function safeParseJson(value) {
  const source = normalizeText(value);
  if (!source) {
    return null;
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    return null;
  }
}

export function normalizeChecklist(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }

  const text = normalizeText(value);
  if (!text) {
    return [];
  }

  return text
    .split(/[\n;；]+/)
    .map((item) => item.replace(/^[-*\d.\s]+/, '').trim())
    .filter(Boolean);
}

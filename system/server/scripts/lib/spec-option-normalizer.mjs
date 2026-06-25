const EN_SPEC_REPLACEMENTS = [
  ['螺纹连接', 'Threaded'],
  ['法兰连接', 'Flanged'],
  ['螺纹', 'Threaded'],
  ['法兰', 'Flanged']
];

const SPEC_VALUE_CODE_SEPARATOR = '|';

export function normalizePageDataSpecOptions(pageData, languageCode) {
  if (!pageData || typeof pageData !== 'object' || Array.isArray(pageData)) {
    return pageData;
  }

  if (String(languageCode || '').toLowerCase() !== 'en') {
    return pageData;
  }

  const topPanel = pageData.topPanel;
  if (!topPanel || typeof topPanel !== 'object' || Array.isArray(topPanel)) {
    return pageData;
  }

  const specOptions = Array.isArray(topPanel.specOptions) ? topPanel.specOptions : null;
  if (!specOptions) {
    return pageData;
  }

  let changed = false;
  const nextSpecOptions = specOptions.map((option) => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) {
      return option;
    }

    const normalizedOption = normalizeEnSpecOption(option);
    const nextLabel = normalizedOption.label;
    const nextValue = normalizedOption.value;

    if (nextLabel !== option.label || nextValue !== option.value) {
      changed = true;
      return {
        ...option,
        ...(nextLabel !== undefined ? { label: nextLabel } : {}),
        ...(nextValue !== undefined ? { value: nextValue } : {})
      };
    }

    return option;
  });

  if (!changed) {
    return pageData;
  }

  return {
    ...pageData,
    topPanel: {
      ...topPanel,
      specOptions: nextSpecOptions
    }
  };
}

export function normalizeEnSpecOption(option) {
  const rawLabel = normalizeEnSpecText(option?.label);
  const rawValue = normalizeEnSpecText(option?.value);
  const displayText = extractSpecDisplayText(rawLabel, rawValue);
  const materialCode = extractSpecMaterialCode(rawValue);
  const compactLabel = compactEnSpecLabel(displayText);

  return {
    label: compactLabel ?? rawLabel,
    value: materialCode || rawValue
  };
}

export function normalizeEnSpecText(value) {
  if (typeof value !== 'string' || !value) {
    return value;
  }

  let next = value;
  for (const [from, to] of EN_SPEC_REPLACEMENTS) {
    next = next.split(from).join(to);
  }

  return next.replace(/\s{2,}/gu, ' ').trim();
}

function extractSpecDisplayText(label, value) {
  if (typeof label === 'string' && label.trim()) {
    return label.trim();
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const [displayText] = value.split(SPEC_VALUE_CODE_SEPARATOR);
  return displayText ? displayText.trim() : value.trim();
}

function extractSpecMaterialCode(value) {
  if (typeof value !== 'string' || !value.includes(SPEC_VALUE_CODE_SEPARATOR)) {
    return null;
  }

  const segments = value.split(SPEC_VALUE_CODE_SEPARATOR);
  const lastSegment = segments[segments.length - 1]?.trim();
  return lastSegment || null;
}

function compactEnSpecLabel(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return value;
  }

  const normalized = value.trim();
  const matched = normalized.match(
    /^([A-Za-z0-9]+)-(\d+(?:\.\d+)?)\s+(.+?)\s+(Threaded|Flanged)$/u
  );

  if (!matched) {
    return normalized;
  }

  const [, , pressure, size, connection] = matched;
  return `${pressure} bar ${size.trim()} ${connection}`;
}

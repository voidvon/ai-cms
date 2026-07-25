export async function* reconcileResponsesStream(stream) {
  const completedOutputItems = new Map();

  for await (const event of stream) {
    collectCompletedOutputItem(event, completedOutputItems);
    yield normalizeResponsesStreamEvent(event, Array.from(completedOutputItems.values()));

    if (event?.type === 'response_done') {
      completedOutputItems.clear();
    }
  }
}

export function normalizeModelResponse(response) {
  if (!response || !Array.isArray(response.output)) {
    return response;
  }

  return {
    ...response,
    output: response.output.map((item) => normalizeResponseOutputItem(item)),
  };
}

export function normalizeResponsesStreamEvent(event, completedRawOutputItems = []) {
  if (event?.type !== 'response_done' || !Array.isArray(event.response?.output)) {
    return event;
  }

  const output = event.response.output.length > 0
    ? event.response.output
    : completedRawOutputItems
      .map(convertRawResponseOutputItem)
      .filter(Boolean);

  return {
    ...event,
    response: normalizeModelResponse({
      ...event.response,
      output,
    }),
  };
}

function collectCompletedOutputItem(event, completedOutputItems) {
  const rawEvent = event?.type === 'model' ? event.event : null;
  if (rawEvent?.type !== 'response.output_item.done' || !rawEvent.item || typeof rawEvent.item !== 'object') {
    return;
  }

  const itemId = String(rawEvent.item.id || '').trim();
  const outputIndex = Number.isInteger(rawEvent.output_index) ? rawEvent.output_index : completedOutputItems.size;
  const key = itemId ? `id:${itemId}` : `index:${outputIndex}`;
  completedOutputItems.set(key, rawEvent.item);
}

function convertRawResponseOutputItem(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  if (item.type === 'message') {
    const { id, type, role, content, status, ...providerData } = item;
    return {
      id,
      type,
      role,
      content: Array.isArray(content) ? content.map(convertRawMessageContentItem).filter(Boolean) : [],
      status,
      providerData,
    };
  }

  if (item.type === 'function_call') {
    const {
      call_id: callId,
      name,
      namespace,
      status,
      arguments: argumentsJson,
      ...providerData
    } = item;
    return {
      type: 'function_call',
      id: item.id,
      callId,
      name,
      ...(typeof namespace === 'string' ? { namespace } : {}),
      status,
      arguments: argumentsJson,
      providerData,
    };
  }

  if (
    item.type === 'file_search_call'
    || item.type === 'web_search_call'
    || item.type === 'image_generation_call'
    || item.type === 'code_interpreter_call'
  ) {
    const { status, result, ...providerData } = item;
    return {
      type: 'hosted_tool_call',
      id: item.id,
      name: item.type,
      status,
      output: result ?? undefined,
      providerData,
    };
  }

  if (item.type === 'reasoning') {
    const { summary, ...providerData } = item;
    return {
      type: 'reasoning',
      id: item.id,
      content: Array.isArray(summary)
        ? summary.map((entry) => ({
          type: 'input_text',
          text: String(entry?.text || ''),
          providerData: omitKeys(entry, ['text']),
        }))
        : [],
      providerData,
    };
  }

  return {
    type: 'unknown',
    id: item.id,
    providerData: item,
  };
}

function convertRawMessageContentItem(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }
  if (item.type !== 'output_text' && item.type !== 'refusal') {
    return null;
  }

  const textField = item.type === 'refusal' ? 'refusal' : 'text';
  const providerData = omitKeys(item, ['type', textField]);
  return {
    type: item.type,
    [textField]: String(item[textField] || ''),
    ...(Object.keys(providerData).length > 0 ? { providerData } : {}),
  };
}

function normalizeResponseOutputItem(item) {
  if (item?.type === 'apply_patch_call') {
    return normalizeStatusWithAllowedValues(item, new Set(['in_progress', 'completed']), 'completed');
  }
  if (item?.type === 'apply_patch_call_output') {
    return normalizeStatusWithAllowedValues(item, new Set(['completed', 'failed']), 'completed');
  }
  if (item && typeof item === 'object' && Object.hasOwn(item, 'status')) {
    return normalizeLifecycleStatus(item);
  }
  return item;
}

function normalizeLifecycleStatus(item) {
  return normalizeStatusWithAllowedValues(
    item,
    new Set(['in_progress', 'completed', 'incomplete']),
    String(item?.status || '').trim() === 'failed' ? 'incomplete' : 'completed',
  );
}

function normalizeStatusWithAllowedValues(item, allowedValues, fallbackStatus) {
  if (!item || typeof item !== 'object') {
    return item;
  }

  if (allowedValues.has(item.status)) {
    return item;
  }

  return {
    ...item,
    status: fallbackStatus,
  };
}

function omitKeys(value, keys) {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const omitted = new Set(keys);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !omitted.has(key)));
}

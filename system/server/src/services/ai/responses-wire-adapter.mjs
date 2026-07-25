const RESPONSE_PATH = /\/responses\/?$/i;
const VALID_STATUSES = new Set(['in_progress', 'completed', 'incomplete']);

/**
 * Normalize provider-specific Responses wire data before the OpenAI SDK parses it.
 * The adapter is deliberately limited to the Responses endpoint so other API
 * resources keep their provider payload unchanged.
 */
export function createResponsesWireFetch(baseFetch = globalThis.fetch) {
  if (typeof baseFetch !== 'function') {
    throw new TypeError('A fetch implementation is required');
  }

  return async function responsesWireFetch(input, init) {
    const response = await baseFetch(input, init);
    if (!isResponsesRequest(input)) {
      return response;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.toLowerCase().includes('text/event-stream') && response.body) {
      return wrapEventStreamResponse(response);
    }

    if (!contentType.toLowerCase().includes('json')) {
      return response;
    }

    const text = await response.text();
    if (!text) {
      return response;
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return response;
    }

    const normalized = normalizeResponsesPayload(payload);
    return createResponseWithBody(response, JSON.stringify(normalized));
  };
}

export function normalizeResponsesPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const normalized = { ...payload };
  if (normalized.response && typeof normalized.response === 'object') {
    normalized.response = normalizeResponseObject(normalized.response);
  }
  if (Array.isArray(normalized.output)) {
    normalized.output = normalized.output.map(normalizeOutputItem);
  }
  if (normalized.item && typeof normalized.item === 'object') {
    normalized.item = normalizeOutputItem(normalized.item);
  }
  return normalized;
}

function normalizeResponseObject(response) {
  const normalized = { ...response };
  if (Array.isArray(normalized.output)) {
    normalized.output = normalized.output.map(normalizeOutputItem);
  } else {
    normalized.output = [];
  }
  if (Object.hasOwn(normalized, 'status')) {
    normalized.status = normalizeStatus(normalized.status);
  }
  return normalized;
}

function normalizeOutputItem(item) {
  if (!item || typeof item !== 'object') {
    return item;
  }

  const normalized = { ...item };
  if (Object.hasOwn(normalized, 'status') || requiresLifecycleStatus(normalized)) {
    normalized.status = normalizeStatus(normalized.status);
  }
  if (normalized.type === 'message' && !Array.isArray(normalized.content)) {
    normalized.content = [];
  }
  if (normalized.type === 'reasoning' && !Array.isArray(normalized.summary)) {
    normalized.summary = [];
  }
  return normalized;
}

function requiresLifecycleStatus(item) {
  return item.type === 'message'
    || item.type === 'function_call'
    || item.type === 'file_search_call'
    || item.type === 'web_search_call'
    || item.type === 'image_generation_call'
    || item.type === 'code_interpreter_call'
    || item.type === 'computer_call'
    || item.type === 'reasoning';
}

function normalizeStatus(status) {
  if (VALID_STATUSES.has(status)) {
    return status;
  }
  if (status === 'failed' || status === 'error') {
    return 'incomplete';
  }
  return 'completed';
}

function isResponsesRequest(input) {
  const url = typeof input === 'string' || input instanceof URL
    ? String(input)
    : input?.url;
  if (!url) {
    return false;
  }
  try {
    return RESPONSE_PATH.test(new URL(url, 'http://localhost').pathname);
  } catch {
    return RESPONSE_PATH.test(String(url).split('?')[0]);
  }
}

function wrapEventStreamResponse(response) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  const body = response.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      buffer = emitCompleteBlocks(buffer, controller, encoder);
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer) {
        controller.enqueue(encoder.encode(normalizeEventBlock(buffer)));
      }
      buffer = '';
    },
  }));

  return createResponseWithBody(response, body);
}

function emitCompleteBlocks(input, controller, encoder) {
  let buffer = input;
  while (true) {
    const match = /\r?\n\r?\n/.exec(buffer);
    if (!match) {
      return buffer;
    }
    const end = match.index + match[0].length;
    const block = buffer.slice(0, end);
    buffer = buffer.slice(end);
    controller.enqueue(encoder.encode(normalizeEventBlock(block)));
  }
}

function normalizeEventBlock(block) {
  const lines = block.split(/(?<=\r?\n)/);
  return lines.map((line) => {
    const match = /^data:\s?(.*?)(\r?\n)?$/.exec(line);
    if (!match || match[1] === '[DONE]') {
      return line;
    }

    try {
      const payload = JSON.parse(match[1]);
      const normalized = JSON.stringify(normalizeResponsesPayload(payload));
      return `data: ${normalized}${match[2] || ''}`;
    } catch {
      return line;
    }
  }).join('');
}

function createResponseWithBody(response, body) {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

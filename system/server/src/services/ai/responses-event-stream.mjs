const RESPONSES_PATH = /\/responses\/?$/i;
const TERMINAL_EVENT_TYPES = new Set([
  'response.completed',
  'response.incomplete',
  'response.failed',
]);

/**
 * Builds terminal Responses snapshots from the authoritative output-item events.
 * This matches event-driven clients such as Codex and avoids guessing missing fields.
 */
export function createEventSourcedResponsesFetch(baseFetch = globalThis.fetch) {
  if (typeof baseFetch !== 'function') {
    throw new TypeError('A fetch implementation is required');
  }

  return async function eventSourcedResponsesFetch(input, init) {
    const response = await baseFetch(input, init);
    if (!isResponsesRequest(input) || !isEventStreamResponse(response) || !response.body) {
      return response;
    }

    return wrapResponsesEventStream(response);
  };
}

export function createResponsesStreamState() {
  return {
    addedItems: new Map(),
    completedItems: new Map(),
    textDeltas: [],
    hasFunctionCall: false,
  };
}

export function reconcileResponsesStreamEvent(event, state) {
  if (!event || typeof event !== 'object') {
    return event;
  }

  if (event.type === 'response.created') {
    state.addedItems.clear();
    state.completedItems.clear();
    state.textDeltas.length = 0;
    state.hasFunctionCall = false;
    return event;
  }

  if (event.type === 'response.output_item.added'
    && Number.isInteger(event.output_index)
    && event.item
    && typeof event.item === 'object') {
    state.addedItems.set(event.output_index, event.item);
    if (event.item.type === 'function_call' || event.item.type === 'custom_tool_call') {
      state.hasFunctionCall = true;
    }
    return event;
  }

  if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
    state.textDeltas.push(event.delta);
    return event;
  }

  if (event.type === 'response.output_item.done'
    && Number.isInteger(event.output_index)
    && event.item
    && typeof event.item === 'object') {
    state.completedItems.set(event.output_index, event.item);
    if (event.item.type === 'function_call' || event.item.type === 'custom_tool_call') {
      state.hasFunctionCall = true;
    }
    return event;
  }

  if (!TERMINAL_EVENT_TYPES.has(event.type)
    || !event.response
    || typeof event.response !== 'object') {
    return event;
  }

  const output = buildEventSourcedOutput(state);

  return {
    ...event,
    response: {
      ...event.response,
      output,
    },
  };
}

function buildEventSourcedOutput(state) {
  if (state.completedItems.size > 0) {
    return [...state.completedItems.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, item]) => item);
  }

  if (state.textDeltas.length === 0 || state.hasFunctionCall) {
    return [];
  }

  const messageSeed = [...state.addedItems.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, item]) => item)
    .find((item) => item?.type === 'message') || {};
  return [{
    ...messageSeed,
    type: 'message',
    role: messageSeed.role || 'assistant',
    status: 'completed',
    content: [{
      type: 'output_text',
      text: state.textDeltas.join(''),
      annotations: [],
      logprobs: [],
    }],
  }];
}

function wrapResponsesEventStream(response) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const streamState = createResponsesStreamState();
  let buffer = '';

  const body = response.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      buffer = emitCompleteEventBlocks(buffer, controller, encoder, streamState);
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer) {
        controller.enqueue(encoder.encode(reconcileEventBlock(buffer, streamState)));
      }
    },
  }));

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function emitCompleteEventBlocks(input, controller, encoder, streamState) {
  let remaining = input;
  while (true) {
    const separator = /\r?\n\r?\n/.exec(remaining);
    if (!separator) {
      return remaining;
    }

    const end = separator.index + separator[0].length;
    const block = remaining.slice(0, end);
    remaining = remaining.slice(end);
    controller.enqueue(encoder.encode(reconcileEventBlock(block, streamState)));
  }
}

function reconcileEventBlock(block, streamState) {
  const lines = block.split(/\r?\n/);
  const dataLineIndexes = [];
  const dataParts = [];

  lines.forEach((line, index) => {
    if (line.startsWith('data:')) {
      dataLineIndexes.push(index);
      dataParts.push(line.slice(5).replace(/^ /, ''));
    }
  });

  if (dataLineIndexes.length === 0 || dataParts[0] === '[DONE]') {
    return block;
  }

  let event;
  try {
    event = JSON.parse(dataParts.join('\n'));
  } catch {
    return block;
  }

  const reconciled = reconcileResponsesStreamEvent(event, streamState);
  if (reconciled === event) {
    return block;
  }

  const firstDataLine = dataLineIndexes[0];
  const extraDataLines = new Set(dataLineIndexes.slice(1));
  const rebuilt = lines
    .filter((_, index) => !extraDataLines.has(index))
    .map((line, index) => (index === firstDataLine
      ? `data: ${JSON.stringify(reconciled)}`
      : line));
  return rebuilt.join(block.includes('\r\n') ? '\r\n' : '\n');
}

function isResponsesRequest(input) {
  const url = typeof input === 'string' || input instanceof URL
    ? String(input)
    : input?.url;
  if (!url) {
    return false;
  }

  try {
    return RESPONSES_PATH.test(new URL(url, 'http://localhost').pathname);
  } catch {
    return RESPONSES_PATH.test(String(url).split('?')[0]);
  }
}

function isEventStreamResponse(response) {
  return String(response.headers.get('content-type') || '')
    .toLowerCase()
    .includes('text/event-stream');
}

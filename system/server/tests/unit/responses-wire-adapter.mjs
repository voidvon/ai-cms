import assert from 'node:assert/strict';
import test from 'node:test';
import { createResponsesWireFetch, normalizeResponsesPayload } from '../../src/services/ai/responses-wire-adapter.mjs';

test('normalizes provider response output items', () => {
  const payload = normalizeResponsesPayload({
    output: [
      { type: 'message', status: 'success', content: null },
      { type: 'reasoning', status: 'failed', summary: null },
    ],
  });

  assert.deepEqual(payload.output, [
    { type: 'message', status: 'completed', content: [] },
    { type: 'reasoning', status: 'incomplete', summary: [] },
  ]);
});

test('normalizes response and output item event payloads', () => {
  const payload = normalizeResponsesPayload({
    response: { output: [{ type: 'function_call', name: 'probe' }], status: 'success' },
    item: { type: 'message', content: null, status: 'success' },
  });

  assert.deepEqual(payload, {
    response: { output: [{ type: 'function_call', name: 'probe', status: 'completed' }], status: 'completed' },
    item: { type: 'message', content: [], status: 'completed' },
  });
});

test('normalizes chunked SSE responses without buffering the full stream', async () => {
  const chunks = [
    'event: response.output_item.done\r\ndata: {"item":{"type":"message","status":"su',
    'ccess","content":null}}\r\n\r\nevent: response.completed\n',
    'data: {"response":{"output":null,"status":"success"}}\n\n',
    'data: [DONE]\n\n',
  ];
  const source = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
  const fetch = createResponsesWireFetch(async () => new Response(source, {
    headers: { 'content-type': 'text/event-stream' },
  }));
  const response = await fetch('https://api.example.test/v1/responses', { method: 'POST' });
  const text = await response.text();

  assert.match(text, /"status":"completed"/g);
  assert.match(text, /"content":\[\]/);
  assert.match(text, /"output":\[\]/);
  assert.match(text, /data: \[DONE\]/);
});

test('continues pulling when an upstream chunk does not contain a complete event', async () => {
  const encoder = new TextEncoder();
  const source = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode('event: response.output_item.done\ndata: {"item":'));
      await new Promise((resolve) => setTimeout(resolve, 5));
      controller.enqueue(encoder.encode('{"type":"function_call","name":"probe"}}\n\n'));
      controller.close();
    },
  });
  const fetch = createResponsesWireFetch(async () => new Response(source, {
    headers: { 'content-type': 'text/event-stream' },
  }));
  const response = await fetch('https://api.example.test/v1/responses');

  assert.match(await response.text(), /"status":"completed"/);
});

test('flushes a final SSE event without a trailing blank line', async () => {
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(
        'data: {"response":{"output":null,"status":"success"}}\n',
      ));
      controller.close();
    },
  });
  const fetch = createResponsesWireFetch(async () => new Response(source, {
    headers: { 'content-type': 'text/event-stream' },
  }));
  const response = await fetch('https://api.example.test/v1/responses');

  assert.match(await response.text(), /"output":\[\],"status":"completed"/);
});

test('leaves non-Responses resources untouched', async () => {
  const fetch = createResponsesWireFetch(async () => new Response(
    JSON.stringify({ status: 'success', content: null }),
    { headers: { 'content-type': 'application/json' } },
  ));
  const response = await fetch('https://api.example.test/v1/chat/completions');
  assert.deepEqual(await response.json(), { status: 'success', content: null });
});

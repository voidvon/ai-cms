import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEventSourcedResponsesFetch,
  createResponsesStreamState,
  reconcileResponsesStreamEvent,
} from '../src/services/ai/responses-event-stream.mjs';

test('rebuilds terminal output from completed output-item events', () => {
  const streamState = createResponsesStreamState();
  const functionCall = {
    type: 'function_call',
    status: 'completed',
    call_id: 'call-1',
    name: 'probe',
    arguments: '{"value":"ok"}',
  };

  reconcileResponsesStreamEvent({
    type: 'response.output_item.done',
    output_index: 0,
    item: functionCall,
  }, streamState);

  const terminal = reconcileResponsesStreamEvent({
    type: 'response.completed',
    response: {
      status: 'completed',
      output: null,
    },
  }, streamState);

  assert.deepEqual(terminal.response.output, [functionCall]);
});

test('preserves complete message content instead of guessing missing fields', () => {
  const completedMessage = {
    type: 'message',
    status: 'completed',
    role: 'assistant',
    content: [{
      type: 'output_text',
      text: 'OK',
      annotations: [],
      logprobs: [],
    }],
  };
  const streamState = createResponsesStreamState();
  streamState.completedItems.set(0, completedMessage);

  const terminal = reconcileResponsesStreamEvent({
    type: 'response.completed',
    response: {
      status: 'completed',
      output: [{
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'OK' }],
      }],
    },
  }, streamState);

  assert.deepEqual(terminal.response.output, [completedMessage]);
});

test('synthesizes text output only from streamed events', () => {
  const streamState = createResponsesStreamState();
  reconcileResponsesStreamEvent({
    type: 'response.output_item.added',
    output_index: 0,
    item: { id: 'msg-1', type: 'message', role: 'assistant', status: 'in_progress', content: [] },
  }, streamState);
  reconcileResponsesStreamEvent({ type: 'response.output_text.delta', delta: 'O' }, streamState);
  reconcileResponsesStreamEvent({ type: 'response.output_text.delta', delta: 'K' }, streamState);

  const terminal = reconcileResponsesStreamEvent({
    type: 'response.completed',
    response: { status: 'completed', output: null },
  }, streamState);

  assert.deepEqual(terminal.response.output, [{
    id: 'msg-1',
    type: 'message',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text: 'OK', annotations: [], logprobs: [] }],
  }]);
});

test('reconciles chunked SSE streams and leaves other endpoints untouched', async () => {
  const encoder = new TextEncoder();
  const chunks = [
    'event: response.output_item.done\ndata: {"type":"response.output_item.done","output_index":0,"item":{"type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"OK","annotations":[]}]}}\n\n',
    'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"OK"}]}]}}\n\n',
    'data: [DONE]\n\n',
  ];
  const baseFetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(chunks[0].slice(0, 60)));
      controller.enqueue(encoder.encode(chunks[0].slice(60) + chunks[1] + chunks[2]));
      controller.close();
    },
  }), { headers: { 'content-type': 'text/event-stream' } });
  const fetch = createEventSourcedResponsesFetch(baseFetch);

  const responsesResult = await fetch('https://example.test/v1/responses');
  const responsesText = await responsesResult.text();
  assert.match(responsesText, /"annotations":\[\]/);
  assert.match(responsesText, /"status":"completed"/);
  assert.match(responsesText, /data: \[DONE\]/);

  const otherResult = await fetch('https://example.test/v1/chat/completions');
  assert.equal(await otherResult.text(), chunks.join(''));
});

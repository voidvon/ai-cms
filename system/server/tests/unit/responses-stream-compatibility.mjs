import assert from 'node:assert/strict';
import {
  normalizeResponsesStreamEvent,
  reconcileResponsesStream,
} from '../../src/services/ai/responses-stream-compatibility.mjs';

async function main() {
  await assertReconstructsMissingFunctionCallOutput();
  await assertPreservesProviderTerminalOutput();
  assertReconstructsAssistantMessageOutput();
  console.log('responses stream compatibility tests passed');
}

async function assertReconstructsMissingFunctionCallOutput() {
  const events = await collect(reconcileResponsesStream(asStream([
    {
      type: 'model',
      event: {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          id: 'fc_1',
          type: 'function_call',
          status: 'completed',
          call_id: 'call_1',
          name: 'replace_document_items',
          arguments: '{"items":[]}',
        },
      },
    },
    responseDone([]),
  ])));

  assert.deepEqual(events[1].response.output, [{
    type: 'function_call',
    id: 'fc_1',
    callId: 'call_1',
    name: 'replace_document_items',
    status: 'completed',
    arguments: '{"items":[]}',
    providerData: {
      id: 'fc_1',
      type: 'function_call',
    },
  }]);
}

async function assertPreservesProviderTerminalOutput() {
  const providerOutput = [{
    type: 'message',
    id: 'msg_terminal',
    role: 'assistant',
    status: 'completed',
    content: [],
  }];
  const events = await collect(reconcileResponsesStream(asStream([
    {
      type: 'model',
      event: {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          id: 'fc_ignored',
          type: 'function_call',
          call_id: 'call_ignored',
          name: 'ignored_tool',
          arguments: '{}',
        },
      },
    },
    responseDone(providerOutput),
  ])));

  assert.deepEqual(events[1].response.output, providerOutput);
}

function assertReconstructsAssistantMessageOutput() {
  const event = normalizeResponsesStreamEvent(responseDone([]), [{
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    content: [{
      type: 'output_text',
      text: 'Updated.',
      annotations: [],
    }],
  }]);

  assert.deepEqual(event.response.output, [{
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    content: [{
      type: 'output_text',
      text: 'Updated.',
      providerData: { annotations: [] },
    }],
    status: 'completed',
    providerData: {},
  }]);
}

function responseDone(output) {
  return {
    type: 'response_done',
    response: {
      id: 'resp_1',
      output,
      usage: {},
    },
  };
}

async function* asStream(events) {
  yield* events;
}

async function collect(stream) {
  const events = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});

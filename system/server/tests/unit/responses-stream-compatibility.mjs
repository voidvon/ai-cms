import assert from 'node:assert/strict';
import { StreamEventResponseCompleted } from '@openai/agents-core/types';
import {
  normalizeModelResponse,
  normalizeResponsesStreamEvent,
  reconcileResponsesStream,
} from '../../src/services/ai/responses-stream-compatibility.mjs';

async function main() {
  await assertReconstructsMissingFunctionCallOutput();
  await assertDoesNotReplayOutputAcrossResponses();
  await assertPreservesProviderTerminalOutput();
  assertReconstructsAssistantMessageOutput();
  assertNormalizesProviderSpecificStatuses();
  assertNormalizedOutputPassesAgentsCoreSchema();
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

async function assertDoesNotReplayOutputAcrossResponses() {
  const events = await collect(reconcileResponsesStream(asStream([
    {
      type: 'model',
      event: {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          id: 'fc_first_turn',
          type: 'function_call',
          status: 'completed',
          call_id: 'call_first_turn',
          name: 'get_document_workspace_context',
          arguments: '{}',
        },
      },
    },
    responseDone([]),
    {
      type: 'model',
      event: {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          id: 'msg_second_turn',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{
            type: 'output_text',
            text: 'Updated.',
            annotations: [],
          }],
        },
      },
    },
    responseDone([]),
  ])));

  assert.deepEqual(
    events[3].response.output.map((item) => item.id),
    ['msg_second_turn'],
  );
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

function assertNormalizesProviderSpecificStatuses() {
  const response = normalizeModelResponse({
    output: [
      {
        id: 'msg_success',
        type: 'message',
        role: 'assistant',
        status: 'success',
        content: [],
      },
      {
        id: 'fc_failed',
        type: 'function_call',
        callId: 'call_failed',
        name: 'example',
        status: 'failed',
        arguments: '{}',
      },
      {
        id: 'patch_success',
        type: 'apply_patch_call_output',
        callId: 'patch_call',
        status: 'success',
        output: 'ok',
      },
      {
        id: 'reasoning_success',
        type: 'reasoning',
        status: 'success',
        content: [],
      },
    ],
  });

  assert.deepEqual(response.output.map((item) => item.status), [
    'completed',
    'incomplete',
    'completed',
    'completed',
  ]);
}

function assertNormalizedOutputPassesAgentsCoreSchema() {
  const event = normalizeResponsesStreamEvent(responseDone([
    {
      id: 'msg_success',
      type: 'message',
      role: 'assistant',
      status: 'success',
      content: [],
    },
    {
      id: 'reasoning_success',
      type: 'reasoning',
      status: 'success',
      content: [],
    },
  ]));

  assert.doesNotThrow(() => StreamEventResponseCompleted.parse(event));
}

function responseDone(output) {
  return {
    type: 'response_done',
    response: {
      id: 'resp_1',
      output,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
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

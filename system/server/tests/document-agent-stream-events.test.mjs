import assert from 'node:assert/strict';
import test from 'node:test';

import { getReasoningSummaryDelta } from '../src/services/document-agent/stream-events.mjs';
import { finishAfterDocumentMutation } from '../src/services/document-agent/agent.mjs';
import { assertAiRunCompleted } from '../src/services/ai/runtime.mjs';

test('extracts Responses reasoning summary deltas', () => {
  const delta = getReasoningSummaryDelta({
    type: 'raw_model_stream_event',
    source: 'openai-responses',
    data: {
      type: 'model',
      event: {
        type: 'response.reasoning_summary_text.delta',
        delta: '正在分析文档字段',
      },
    },
  });

  assert.equal(delta, '正在分析文档字段');
});

test('ignores non-reasoning stream events', () => {
  assert.equal(getReasoningSummaryDelta({
    type: 'raw_model_stream_event',
    source: 'openai-responses',
    data: {
      type: 'model',
      event: { type: 'response.output_text.delta', delta: '完成' },
    },
  }), '');
});

test('continues the agent after read-only tools', () => {
  assert.deepEqual(finishAfterDocumentMutation(null, [{
    tool: { name: 'get_document_workspace_context' },
    output: '{}',
  }]), {
    isFinalOutput: false,
    isInterrupted: undefined,
  });
});

test('finishes without another model turn after document mutations', () => {
  const result = finishAfterDocumentMutation(null, [
    {
      tool: { name: 'any_document_mutation' },
      output: JSON.stringify({ document_updated: true, summary: '录入客户信息' }),
    },
    {
      tool: { name: 'another_document_mutation' },
      output: { document_updated: true, summary: '录入交付条款' },
    },
  ]);

  assert.deepEqual(result, {
    isFinalOutput: true,
    isInterrupted: undefined,
    finalOutput: '文档已更新并同步到预览：录入客户信息；录入交付条款。',
  });
});

test('treats a cancelled agent stream as a timeout', () => {
  assert.throws(
    () => assertAiRunCompleted({ cancelled: true }),
    (error) => error?.statusCode === 504 && /超时/.test(error.message),
  );
  assert.doesNotThrow(() => assertAiRunCompleted({ cancelled: false }));
});

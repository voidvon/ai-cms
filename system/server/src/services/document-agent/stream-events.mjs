import { isOpenAIResponsesRawModelStreamEvent } from '@openai/agents';

export function getReasoningSummaryDelta(event) {
  if (!isOpenAIResponsesRawModelStreamEvent(event)) {
    return '';
  }

  const rawEvent = event.data?.event;
  if (rawEvent?.type !== 'response.reasoning_summary_text.delta') {
    return '';
  }

  return String(rawEvent.delta || '');
}

import { describe, expect, test } from 'bun:test';
import { createTurnObserver, mapSessionEvent } from './lifecycle-events.mjs';

describe('官方会话事件映射', () => {
  test('实时工具事件只包含身份与状态，不转发参数或结果', () => {
    for (const [type, phase] of [['tool_execution_start', 'start'], ['tool_execution_update', 'update'], ['tool_execution_end', 'end']]) {
      const event = { type, toolCallId: 'call-1', toolName: 'edit_read', isError: true,
        args: { apiKey: 'secret' }, result: { path: 'C:/private' }, partialResult: 'private-result' };
      expect(mapSessionEvent(event)).toEqual({ type: 'tool', phase, toolCallId: 'call-1', tool: 'edit_read', ...(phase === 'end' ? { isError: true } : {}) });
    }
    expect(mapSessionEvent({ type: 'tool_execution_start', toolName: 'read' })).toBeNull();
    expect(mapSessionEvent({ type: 'tool_execution_start', toolCallId: 'a', toolName: 'C:/private' })).toBeNull();
  });

  test('并行调用独立结算，重复更新合并，未结束调用保存为未确认', () => {
    const observer = createTurnObserver();
    const tool = (id, phase, isError = false) => ({ type: `tool_execution_${phase}`, toolCallId: id, toolName: 'edit_read', isError });
    observer.handle(tool('one', 'start'));
    observer.handle(tool('two', 'start'));
    expect(observer.handle(tool('one', 'update')).phase).toBe('update');
    expect(observer.handle(tool('one', 'update'))).toBeNull();
    observer.handle(tool('two', 'end', true));
    observer.handle(tool('two', 'start'));
    expect(observer.toolActivity).toEqual([
      { toolCallId: 'one', tool: 'edit_read', status: 'interrupted', updated: true },
      { toolCallId: 'two', tool: 'edit_read', status: 'error' },
    ]);
    observer.handle(tool('one', 'end'));
    expect(observer.toolActivity[0].status).toBe('completed');
  });
  test('只转发 text_delta 与有用的压缩/重试生命周期，不把 agent_end 当成回合结束', () => {
    expect(mapSessionEvent({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: '雨夜' },
    })).toEqual({ type: 'text_delta', delta: '雨夜' });
    expect(mapSessionEvent({ type: 'compaction_start', reason: 'threshold' }))
      .toEqual({ type: 'lifecycle', phase: 'compaction', reason: 'threshold' });
    expect(mapSessionEvent({ type: 'compaction_end', reason: 'threshold', aborted: false, willRetry: true }))
      .toEqual({ type: 'lifecycle', phase: 'compaction_end', reason: 'threshold', aborted: false, willRetry: true });
    expect(mapSessionEvent({ type: 'auto_retry_start', attempt: 1, maxAttempts: 3 }))
      .toEqual({ type: 'lifecycle', phase: 'retry', attempt: 1, maxAttempts: 3 });
    expect(mapSessionEvent({ type: 'auto_retry_end', success: false, attempt: 1 }))
      .toEqual({ type: 'lifecycle', phase: 'retry_end', success: false, attempt: 1 });
    expect(mapSessionEvent({
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_delta', delta: 'draft' },
    })).toBeNull();
    expect(mapSessionEvent({ type: 'agent_end', messages: [], willRetry: false })).toBeNull();
    expect(mapSessionEvent({ type: 'agent_end', messages: [], willRetry: true })).toBeNull();
    expect(mapSessionEvent({ type: 'agent_settled' })).toBeNull();
    expect(mapSessionEvent({ type: 'turn_end' })).toBeNull();
  });

  test('observer 用 message_end 与 agent_settled，不把 willRetry 的 agent_end 当成终态', () => {
    const observer = createTurnObserver();
    expect(observer.handle({ type: 'agent_end', messages: [], willRetry: true })).toBeNull();
    expect(observer.settled).toBe(false);
    const assistant = { role: 'assistant', content: [{ type: 'text', text: '整理后的回复' }], stopReason: 'stop' };
    expect(observer.handle({ type: 'message_end', message: assistant })).toBeNull();
    expect(observer.lastAssistantMessage).toEqual(assistant);
    expect(observer.handle({ type: 'agent_settled' })).toBeNull();
    expect(observer.settled).toBe(true);
    expect(observer.lastAgentEnd.willRetry).toBe(true);
  });
});

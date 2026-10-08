// 把官方 AgentSession 事件收成宿主 NDJSON。
// agent_end 只表示一次底层 run 结束，仍可能自动重试/压缩恢复；终态用 agent_settled + message_end + prompt 错误。
const toolPhases = new Map([['tool_execution_start', 'start'], ['tool_execution_update', 'update'], ['tool_execution_end', 'end']]);

export function mapSessionEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const phase = toolPhases.get(event.type);
  if (phase) {
    // 只传身份与状态；参数、结果、文件路径及凭据不进入进度事件。
    if (typeof event.toolCallId !== 'string' || !event.toolCallId || event.toolCallId.length > 256 ||
        typeof event.toolName !== 'string' || !/^[\w.:-]{1,128}$/.test(event.toolName)) return null;
    return { type: 'tool', phase, toolCallId: event.toolCallId, tool: event.toolName,
      ...(phase === 'end' ? { isError: event.isError === true } : {}) };
  }
  if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
    return { type: 'text_delta', delta: event.assistantMessageEvent.delta };
  }
  if (event.type === 'compaction_start') {
    return { type: 'lifecycle', phase: 'compaction', reason: event.reason };
  }
  if (event.type === 'compaction_end') {
    return { type: 'lifecycle', phase: 'compaction_end', reason: event.reason, aborted: Boolean(event.aborted), willRetry: Boolean(event.willRetry) };
  }
  if (event.type === 'auto_retry_start') {
    return { type: 'lifecycle', phase: 'retry', attempt: event.attempt, maxAttempts: event.maxAttempts };
  }
  if (event.type === 'auto_retry_end') {
    return { type: 'lifecycle', phase: 'retry_end', success: Boolean(event.success), attempt: event.attempt };
  }
  return null;
}

export function createTurnObserver() {
  let lastAssistantMessage = null;
  let settled = false;
  let lastAgentEnd = null;
  const activities = new Map();
  return {
    // 未收到结束事件的工具不能冒充成功，包括取消、断流和宿主异常。
    get toolActivity() { return [...activities.values()].map(item => ({ ...item, status: item.status === 'running' ? 'interrupted' : item.status })); },
    get lastAssistantMessage() { return lastAssistantMessage; },
    get settled() { return settled; },
    get lastAgentEnd() { return lastAgentEnd; },
    handle(event) {
      if (event?.type === 'message_end' && event.message?.role === 'assistant') {
        lastAssistantMessage = event.message;
        return null;
      }
      if (event?.type === 'agent_settled') {
        settled = true;
        return null;
      }
      if (event?.type === 'agent_end') {
        lastAgentEnd = event;
        return null;
      }
      const payload = mapSessionEvent(event);
      if (payload?.type === 'tool') {
        const previous = activities.get(payload.toolCallId);
        if (payload.phase === 'update' && (previous?.updated || previous && previous.status !== 'running')) return null;
        if (!previous || previous.status === 'running') activities.set(payload.toolCallId, {
          toolCallId: payload.toolCallId, tool: previous?.tool || payload.tool,
          status: payload.phase === 'end' ? (payload.isError ? 'error' : 'completed') : 'running',
          ...(payload.phase === 'update' || previous?.updated ? { updated: true } : {}),
        });
      }
      return payload;
    },
  };
}

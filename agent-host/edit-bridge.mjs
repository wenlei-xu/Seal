import { toolOperationId } from './session-identity.mjs';
import crypto from 'node:crypto';
import { budgetError, spendToolStep } from './request-budget.mjs';

export function createEditBridge({ opsUrl, hostToken, desktopToken, turnBudgetContext, readOnly = false }) {
  async function request(canvasId, editId, action, payload, signal, turnId) {
    const response = await fetch(`${opsUrl}/edit-projects/${encodeURIComponent(canvasId)}/edits/${encodeURIComponent(editId)}/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Beeftv-Agent-Token': hostToken,
        'X-Desktop-Token': desktopToken, 'X-Beeftv-Agent-Turn': turnId }, body: JSON.stringify(payload), signal,
    });
    const envelope = await response.json();
    if (!response.ok || envelope.code !== 0) throw Object.assign(new Error(envelope.msg || 'Edit command failed'), { reason: envelope.reason });
    return envelope.data;
  }

  const definitions = [
    { name: 'edit_read', description: 'Read a file of the frozen editing project. Read the master HTML before changing clips.',
      properties: { file: { type: 'string', description: 'Relative file path, normally index.html' } }, action: 'read', readOnly: true },
    { name: 'edit_history', description: 'Read the native editing history, including human and Agent scene submissions. Use actual entry IDs for an explicitly requested undo.',
      properties: {}, action: 'history', readOnly: true },
    { name: 'edit_undo_entry', description: 'Undo one exact editing-history entry requested by the user. Read edit_history first. If later edits conflict, the command refuses to discard them.',
      properties: { entryId: { type: 'string' } }, required: ['entryId'], nativeRoute: 'history/undo' },
    { name: 'edit_patch_element', description: 'Modify one native HyperFrames element: text, styles or clip timing. Preserve unspecified properties.',
      properties: { file: { type: 'string' }, target: { type: 'object', properties: { id: { type: 'string' }, hfId: { type: 'string' } } },
        operations: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['text-content', 'attribute', 'inline-style'] }, property: { type: 'string' }, value: { type: 'string' } }, required: ['type', 'property', 'value'] }, description: 'Native operations, e.g. {type:"text-content",property:"textContent",value:"title"}, {type:"attribute",property:"data-start",value:"2"}, {type:"inline-style",property:"opacity",value:"0.5"}' } },
      required: ['file', 'target', 'operations'], route: 'patch-element' },
    { name: 'edit_split_element', description: 'Split a native clip while preserving its source in-point.',
      properties: { file: { type: 'string' }, target: { type: 'object', properties: { id: { type: 'string' }, hfId: { type: 'string' } } }, splitTime: { type: 'number' }, newId: { type: 'string' } },
      required: ['file', 'target', 'splitTime', 'newId'], route: 'split-element' },
    { name: 'edit_remove_element', description: 'Remove the requested native element.',
      properties: { file: { type: 'string' }, target: { type: 'object', properties: { id: { type: 'string' }, hfId: { type: 'string' } } } },
      required: ['file', 'target'], route: 'remove-element' },
  ];

  function buildTools(canvasId, log, generation, turn, identityPrefix) {
    return definitions.filter(definition => !readOnly || definition.readOnly).map(definition => ({
      name: definition.name, label: definition.name, description: definition.description,
      parameters: { type: 'object', properties: definition.properties, required: definition.required || [], additionalProperties: false },
      ...(definition.readOnly ? {} : { executionMode: 'sequential' }),
      execute: async (toolCallId, args, signal) => {
        const context = turn.workspaceContext;
        if (context?.mode !== 'edit' || context.projectId !== canvasId) throw new Error('edit_scope_required: Switch to an edit project before using edit tools');
        if (generation.aborted || signal?.aborted) throw new Error('aborted');
        if (!definition.readOnly && !toolCallId) throw new Error('missing_tool_call_id: Editing writes require a durable tool-call identity');
        const budget = turnBudgetContext.getStore();
        const step = spendToolStep(budget);
        if (!step.allowed) { if (budget) budget.failure = step; throw budgetError(step); }
        const action = definition.action || 'mutate';
        const payload = definition.readOnly ? (definition.action === 'read' ? { file: args.file || 'index.html' } : {}) : {
          operationId: crypto.createHash('sha256').update(toolOperationId(identityPrefix, toolCallId)).digest('hex'), expectedRevision: turn.editRevision,
          route: definition.nativeRoute || `file-mutations/${definition.route}/${args.file.split('/').map(encodeURIComponent).join('/')}`,
          payload: { ...Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'file')),
            ...(definition.nativeRoute ? { who: { kind: 'agent', name: 'Seal' } } : {}) }, label: 'Edited by Agent', turnId: turn.turnId,
        };
        try {
          const result = await request(canvasId, context.editId, action, payload, signal, turn.turnId);
          if (!definition.readOnly) turn.editRevision = result.revision;
          log.push({ toolCallId, tool: definition.name, args, isError: false });
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } catch (error) {
          log.push({ toolCallId, tool: definition.name, args, isError: true, error: error.reason || 'edit_failed' });
          throw error;
        }
      },
    }));
  }
  return { buildTools };
}

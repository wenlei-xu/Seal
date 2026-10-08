import crypto from 'node:crypto';

export const WORKFLOW_ENTRY_TYPE = 'beeftv.creator-workflow';
export function workflowHistory(entries) {
  const latest = new Map();
  for (const entry of entries) if (entry.type === 'custom' && entry.customType === WORKFLOW_ENTRY_TYPE && entry.data?.workflow?.id) latest.set(entry.data.workflow.id, entry.data.workflow);
  return [...latest.values()];
}

// The official SessionManager remains the sole conversation/checkpoint journal.
// These checkpoints describe a plan. Actual worker status comes from task APIs.
export function workflowJournal(manager, sessionIdentity) {
  return {
    read: () => workflowHistory(manager.getEntries()),
    save(args, operationID, turnID) {
      const body = JSON.stringify(args);
      if (Buffer.byteLength(body) > 65536 || !args.title?.trim() || args.title.length > 200 || !args.goal?.trim() || args.goal.length > 8000
        || !Array.isArray(args.steps) || !args.steps.length || args.steps.length > 32) throw new Error('invalid_workflow_checkpoint');
      const stepIDs = new Set();
      for (const step of args.steps) {
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(step.id) || stepIDs.has(step.id) || !step.label?.trim() || step.label.length > 300
          || !['pending', 'waiting', 'done'].includes(step.state) || step.note?.length > 2000) throw new Error('invalid_workflow_step');
        stepIDs.add(step.id);
      }
      const hash = crypto.createHash('sha256').update(body).digest('hex');
      const records = manager.getEntries().filter(entry => entry.type === 'custom' && entry.customType === WORKFLOW_ENTRY_TYPE);
      const receipt = records.find(entry => entry.data.operationID === operationID);
      if (receipt) {
        if (receipt.data.hash !== hash) throw new Error('workflow_operation_conflict');
        return receipt.data.workflow;
      }
      const id = args.id || `workflow_${crypto.createHash('sha256').update(sessionIdentity + ':' + operationID).digest('hex').slice(0, 32)}`;
      const previous = workflowHistory(records).find(item => item.id === id);
      if (args.id && !previous) throw new Error('workflow_not_found');
      if ((previous?.revision || 0) !== (args.expectedRevision || 0)) throw new Error('workflow_revision_conflict');
      const workflow = { id, title: args.title.trim(), goal: args.goal.trim(), steps: structuredClone(args.steps),
        revision: (previous?.revision || 0) + 1, turnId: turnID, updatedAt: new Date().toISOString() };
      manager.appendCustomEntry(WORKFLOW_ENTRY_TYPE, { operationID, hash, workflow });
      return workflow;
    },
  };
}

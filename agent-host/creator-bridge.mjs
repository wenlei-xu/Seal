import crypto from 'node:crypto';
import { toolOperationId } from './session-identity.mjs';
import { budgetError, spendToolStep } from './request-budget.mjs';

export function createCreatorBridge({ opsUrl, hostToken, desktopToken, turnBudgetContext, readOnly = false }) {
  const definitions = [
    { name: 'workflow_read', local: true, readOnly: true, properties: {}, description: 'Read saved creation plans, step IDs and intermediate result references from this official Pi session. Before resuming, inspect real task/candidate status. Checkpoint state is a plan record, not proof that a worker is alive or work succeeded.' },
    { name: 'workflow_checkpoint', local: true, properties: { id: { type: 'string' }, expectedRevision: { type: 'integer', minimum: 0 }, title: { type: 'string' }, goal: { type: 'string' }, steps: { type: 'array', maxItems: 32, items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' }, state: { type: 'string', enum: ['pending', 'waiting', 'done'] }, note: { type: 'string' }, taskId: { type: 'string' }, taskKind: { type: 'string', enum: ['asr', 'generation'] }, candidateId: { type: 'string' }, operationId: { type: 'string' }, fileHash: { type: 'string' } }, required: ['id', 'label', 'state'], additionalProperties: false } } }, required: ['title', 'goal', 'steps'], description: 'Persist a requested multi-step plan and actual task/candidate/operation references after each meaningful step. Updates need id and expectedRevision. Reuse saved result IDs and idempotency receipts; never invent completion or resubmit billable work because a turn ended. Keep secrets and temporary absolute paths out of checkpoints.' },
    { name: 'media_generation_propose', action: 'media/propose', properties: { kind: { type: 'string', enum: ['image', 'video', 'audio'] }, prompt: { type: 'string' }, model: { type: 'string' }, workflowId: { type: 'string' }, stepId: { type: 'string' } }, required: ['kind', 'prompt'], description: 'Propose image/video/TTS through the configured channel. Audio prompt is exact narration. For a multi-step plan, supply workflowId and stepId from workflow_read so the same step reuses its proposal across turns and restarts. Persist for UI acceptance; never starts paid work. Output goes to the asset library.' },
    { name: 'media_generation_list', action: 'media/proposals', readOnly: true, properties: {}, description: 'List persisted current-project generation proposals and existing task IDs. Reuse accepted tasks after interruption; do not propose the same paid work again.' },
    { name: 'media_generation_task', action: 'media/task', readOnly: true, properties: { taskId: { type: 'string' } }, required: ['taskId'], description: 'Read an accepted generation task and materialized asset IDs. Provider status is separate from result materialization. Continue with READY assets; never resubmit because a stream or conversation stopped.' },
    { name: 'skill_list', action: 'skills/list', readOnly: true, properties: {}, description: 'List the current user Skill Hub, enabled state, source and current content hash. Find an existing user Skill before creating a duplicate.' },
    { name: 'skill_file', action: 'skills/file', readOnly: true, properties: { id: { type: 'string' }, file: { type: 'string' } }, required: ['id', 'file'], description: 'Read an owned Skill file from Skill Hub before updating. This does not activate disabled Skills or grant script execution.' },
    { name: 'skill_author', action: 'skills/author', skill: 'skill-creator', properties: {
      files: { type: 'object', additionalProperties: { type: 'string' }, description: 'Text files including exactly one SKILL.md with name and description; optional references/scripts remain inert.' },
      targetId: { type: 'string' }, expectedTargetHash: { type: 'string' }, enabled: { type: 'boolean' }, save: { type: 'boolean' },
    }, required: ['files', 'save', 'enabled'], description: 'Create or update a user Skill from the requested reusable method or personal style. save=false validates only; save=true stores an immutable version. Updates require targetId and the last read content hash. Builtins cannot be changed. Format validation is not behavioral verification. Saved Skills load next turn.' },
    { name: 'skill_search', action: 'skills/search', readOnly: true, properties: { query: { type: 'string' } }, required: ['query'], description: 'Find public GitHub repositories for a requested Skill. Search hits are unverified; inspect the repository/subdirectory before selecting. Network failures are real failures.' },
    { name: 'skill_download', action: 'skills/download', properties: { url: { type: 'string' }, ref: { type: 'string' }, subdir: { type: 'string' }, targetId: { type: 'string' }, expectedTargetHash: { type: 'string' }, enabled: { type: 'boolean' } }, required: ['url', 'enabled'], description: 'When the user requests skill installation, download one public GitHub Skill into Skill Hub, pin its actual commit, and optionally enable next turn. Specify subdir for multi-skill repositories. Scripts are not executed. Updates require the current content hash. No dependency install or auto-upgrade.' },
    { name: 'media_asr_status', action: 'media/asr-status', readOnly: true, properties: {}, description: 'Inspect local Whisper Base readiness and the configured transcription service. No secret endpoints are exposed. Local multilingual Base is preferred when installed.' },
    { name: 'media_transcribe', action: 'media/transcribe', properties: { assetId: { type: 'string' }, language: { type: 'string' }, route: { type: 'string', enum: ['local', 'service'] } }, required: ['assetId'], description: 'Start or reuse ASR for a referenced owned video/audio asset. Local Whisper Base is preferred; service uses the existing configured transcription service. Returns a durable task ID, not a finished transcript. Query media_transcription; do not repeatedly submit or assume completion.' },
    { name: 'media_transcription', action: 'media/transcription', readOnly: true, properties: { taskId: { type: 'string' } }, required: ['taskId'], description: 'Read the current project ASR task and persisted timestamped transcript. timingLevel=segment or token must be respected; token alignment is approximate, not guaranteed exact word boundaries.' },
  ];
  return {
    buildTools(projectId, log, generation, turn, identityPrefix) {
      return definitions.filter(item => !readOnly || item.readOnly).map(item => ({
        name: item.name, label: item.name, description: item.description, executionMode: 'sequential',
        parameters: { type: 'object', properties: item.properties, required: item.required || [], additionalProperties: false },
        execute: async (toolCallId, args, signal) => {
          if (!turn.turnId || generation.aborted || signal?.aborted) throw new Error('active_turn_required');
          if (item.skill && !turn.skillSnapshot?.skills.some(skill => skill.name === item.skill)) throw new Error('skill_creator_disabled');
          if (!item.readOnly && !toolCallId) throw new Error('missing_tool_call_id');
          const step = spendToolStep(turnBudgetContext.getStore());
          if (!step.allowed) throw budgetError(step);
          let operationKey = item.readOnly ? undefined : toolOperationId(identityPrefix, toolCallId);
          if (item.name === 'media_generation_propose' && (args.workflowId || args.stepId)) {
            const workflow = turn.workflowJournal?.read().find(value => value.id === args.workflowId);
            if (!workflow || !workflow.steps.some(step => step.id === args.stepId)) throw new Error('workflow_step_not_found');
            operationKey = `${identityPrefix}:workflow:${workflow.id}:${args.stepId}`;
          }
          const operationId = operationKey ? crypto.createHash('sha256').update(operationKey).digest('hex') : undefined;
          try {
            if (item.local) {
              if (!turn.workflowJournal) throw new Error('workflow_journal_unavailable');
              const data = item.name === 'workflow_read' ? { workflows: turn.workflowJournal.read() } : turn.workflowJournal.save(args, operationId, turn.turnId);
              log.push({ toolCallId, tool: item.name, isError: false });
              return { content: [{ type: 'text', text: JSON.stringify(data) }] };
            }
            const response = await fetch(`${opsUrl}/assistant/projects/${encodeURIComponent(projectId)}/${item.action}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Beeftv-Agent-Token': hostToken, 'X-Desktop-Token': desktopToken, 'X-Beeftv-Agent-Turn': turn.turnId },
              body: JSON.stringify({ ...args, ...(operationId ? { operationId } : {}) }), signal,
            });
            const envelope = await response.json();
            if (!response.ok || envelope.code !== 0) throw Object.assign(new Error(envelope.msg || 'Creator operation failed'), { reason: envelope.reason });
            if (item.name === 'media_generation_propose') {
              const data = envelope.data;
              if (!turn.proposals.some(proposal => proposal.proposalId === data.proposalId)) turn.proposals.push({
                proposalId: data.proposalId, kind: data.kind, model: data.model, modelKey: data.modelKey, prompt: data.prompt,
                nodeIds: [], assetGeneration: true, source: { canvasId: projectId, canvasRevision: 0, modelConfigRevision: data.configRevision },
              });
            }
            // File bodies, transcripts and generated Skill instructions stay in the
            // official transcript; UI activity logs only retain compact identities.
            log.push({ toolCallId, tool: item.name, args: { id: args.id, taskId: args.taskId, assetId: args.assetId, targetId: args.targetId }, isError: false });
            return { content: [{ type: 'text', text: JSON.stringify(envelope.data) }] };
          } catch (error) { log.push({ toolCallId, tool: item.name, isError: true, error: error.reason || 'creator_failed' }); throw error; }
        },
      }));
    },
  };
}

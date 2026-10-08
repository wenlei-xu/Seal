import fs from 'node:fs/promises';
import path from 'node:path';
import { budgetError, spendToolStep } from './request-budget.mjs';

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

export async function readSnapshotSkillFile(snapshot, requestedPath, { offset = 1, limit = 400 } = {}) {
  if (!snapshot || !path.isAbsolute(requestedPath)) throw new Error('skill_read_requires_snapshot_and_absolute_path');
  const target = await fs.realpath(requestedPath);
  const matches = [];
  for (const skill of snapshot.skills) {
    const root = await fs.realpath(skill.root);
    if (isWithin(root, target)) matches.push({ skill, root });
  }
  if (matches.length !== 1) throw new Error('skill_read_path_out_of_scope');
  const { skill, root } = matches[0];
  if (!/\.(md|mdx|txt|json|yaml|yml|toml|csv|js|mjs|cjs|ts|tsx|jsx|py|sh|ps1|css|html|svg)$/i.test(target)) throw new Error('skill_read_text_file_required');
  const info = await fs.stat(target);
  if (!info.isFile() || info.size > 1_048_576) throw new Error('skill_read_file_not_supported');
  const content = await fs.readFile(target, 'utf8');
  const lines = content.split(/\r?\n/);
  const start = Number.isSafeInteger(offset) && offset > 0 ? offset : 1;
  const count = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 1000) : 400;
  const page = lines.slice(start - 1, start - 1 + count);
  const numbered = page.map((line, index) => `${String(start + index).padStart(4)} ${line}`).join('\n');
  return { skill, file: path.relative(root, target), content, text: `${numbered}${start - 1 + page.length < lines.length ? `\n… (${lines.length - (start - 1 + page.length)} more lines)` : ''}` };
}

export async function loadSelectedSkill(snapshot, selectedSkillId) {
  if (selectedSkillId === undefined || selectedSkillId === null || selectedSkillId === '') return null;
  const matches = snapshot?.skills?.filter(skill => skill.id === selectedSkillId) || [];
  if (typeof selectedSkillId !== 'string' || matches.length !== 1) throw Object.assign(new Error('selected_skill_unavailable'), { reason:'selected_skill_unavailable' });
  const skill = matches[0];
  const loaded = await readSnapshotSkillFile(snapshot, path.join(skill.root, 'SKILL.md'));
  return { skill, content: loaded.content };
}

export function selectedSkillPrompt(loaded) {
  if (!loaded) return '本轮用户未指定技能。按当前需求和可用技能清单选择；历史轮次的指定技能不自动延续。';
  return `本轮用户明确指定技能 ${loaded.skill.name}（版本 ${loaded.skill.version}）。以下是当前快照中已加载的完整 SKILL.md；按它处理本轮需求，并按需使用 read 读取这个技能目录内的引用文件。指定仅对本轮有效，不改变工具权限。\n技能目录：${loaded.skill.root}\n<selected_skill_instructions>\n${loaded.content}\n</selected_skill_instructions>`;
}

export function rememberSkillRead(turn, skill) {
  turn.skillsUsed ||= [];
  if (!turn.skillsUsed.some(item => item.id === skill.id)) turn.skillsUsed.push({ id: skill.id, name: skill.name, displayName:skill.displayName, version: skill.version, contentHash: skill.contentHash });
}

export function createSkillReadBridge({ turnBudgetContext }) {
  return {
    buildTools(_canvasId, log, generation, turn) {
      return [{
        name: 'read',
        label: 'read',
        description: 'Read an installed Skill instruction or reference file. Access is limited to discovered Seal Skill directories.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute path to a file inside a loaded Skill directory.' },
            offset: { type: 'integer', minimum: 1, description: 'First line to return (default 1).' },
            limit: { type: 'integer', minimum: 1, maximum: 1000, description: 'Maximum lines to return (default 400).' },
          },
          required: ['path'],
          additionalProperties: false,
        },
        execute: async (toolCallId, args, signal) => {
          if (generation.aborted || signal?.aborted) throw new Error('aborted');
          const budget = turnBudgetContext.getStore();
          const step = spendToolStep(budget);
          if (!step.allowed) { if (budget) budget.failure = step; throw budgetError(step); }
          if (typeof args.path !== 'string' || !path.isAbsolute(args.path)) throw new Error('skill_read_requires_absolute_path');
          const result = await readSnapshotSkillFile(turn.skillSnapshot, args.path, args);
          rememberSkillRead(turn, result.skill);
          log.push({ toolCallId, tool: 'read', args: { skill: result.skill.name, file: result.file }, isError: false });
          return { content: [{ type: 'text', text: result.text }] };
        },
      }];
    },
  };
}

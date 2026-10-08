import { test, expect } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadSelectedSkill, selectedSkillPrompt, rememberSkillRead } from './skill-read-bridge.mjs';

test('explicit selection loads the full frozen entry and records its actual version', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'beeftv-selected-skill-'));
  try {
    const content='---\nname: sample\ndescription: A local workflow\n---\n'+Array.from({length:1050},(_,i)=>`Step ${i+1}`).join('\n');
    await fs.writeFile(path.join(root,'SKILL.md'),content);
    const skill={id:'user-sample',name:'sample',displayName:'示例技能',version:'1',contentHash:'first',root};
    const snapshot={skills:[skill]};
    const loaded=await loadSelectedSkill(snapshot,skill.id);
    expect(loaded.content).toBe(content);
    expect(selectedSkillPrompt(loaded)).toContain('Step 1050');
    const turn={skillsUsed:[]};
    rememberSkillRead(turn,loaded.skill);rememberSkillRead(turn,loaded.skill);
    expect(turn.skillsUsed).toEqual([{id:skill.id,name:'sample',displayName:'示例技能',version:'1',contentHash:'first'}]);
    await expect(loadSelectedSkill({skills:[]},skill.id)).rejects.toMatchObject({reason:'selected_skill_unavailable'});
    await expect(loadSelectedSkill(snapshot,'other-user-skill')).rejects.toMatchObject({reason:'selected_skill_unavailable'});
    await expect(loadSelectedSkill(snapshot,['user-sample'])).rejects.toMatchObject({reason:'selected_skill_unavailable'});
    expect(await loadSelectedSkill(snapshot,undefined)).toBeNull();
    expect(selectedSkillPrompt(null)).toContain('历史轮次的指定技能不自动延续');
    expect(selectedSkillPrompt(loaded)).toContain('Step 1050');
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});

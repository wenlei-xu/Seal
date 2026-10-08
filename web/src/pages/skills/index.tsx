import { useRef, useState } from 'react';
import { App, Button, Dropdown, Input, Select, Spin } from 'antd';
import { ArrowUpFromLine, MoreHorizontal, Puzzle, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, WorkspacePage } from '@/components/layout/workspace-page';
import { AppModal } from '@/components/ui/product/app-modal';
import { captureUserScope, assertUserScope } from '@/lib/user-scope-guard';
import { enableHubSkill, listHubSkills, uninstallHubSkill, type HubSkill } from '@/services/api/skill-hub';
import { SkillImportPanel } from './skill-hub-import';
import { SkillFilesModal } from './skill-hub-files';
import './skill-hub.css';

export default function SkillsPage() {
    const { message } = App.useApp();
    const [scope] = useState(() => captureUserScope());
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [detail, setDetail] = useState<HubSkill | null>(null);
    const [importing, setImporting] = useState<{ file: File; target?: HubSkill; selectionId: string } | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const importTarget = useRef<HubSkill | undefined>(undefined);
    const [importBusy, setImportBusy] = useState(false);
    const [removing, setRemoving] = useState<HubSkill | null>(null);
    const [pending, setPending] = useState('');
    const skills = useQuery({ queryKey: ['skill-hub', scope.userScope, scope.epoch], queryFn: ({ signal }) => listHubSkills(scope, signal) });
    const visible = skills.data?.skills.filter(skill =>
        (filter === 'all' || (filter === 'enabled' && skill.enabled) || (filter === 'disabled' && !skill.enabled) || (filter === 'builtin' && skill.builtin)) &&
        `${skill.displayName} ${skill.name} ${skill.description}`.toLowerCase().includes(search.trim().toLowerCase())) ?? [];
    function chooseFile(target?: HubSkill) {
        importTarget.current = target;
        fileInput.current?.click();
    }
    async function toggle(skill: HubSkill) {
        setPending(skill.id);
        try { await enableHubSkill(skill.id, !skill.enabled, scope); assertUserScope(scope); await skills.refetch(); message.success(skill.enabled ? '已停用，下一轮对话生效' : '已启用，下一轮对话生效'); }
        catch (error) { message.error(error instanceof Error ? error.message : '设置失败'); }
        finally { setPending(''); }
    }
    async function remove() {
        if (!removing) return;
        setPending(removing.id);
        try { await uninstallHubSkill(removing.id, scope); assertUserScope(scope); setRemoving(null); if (detail?.id === removing.id) setDetail(null); await skills.refetch(); message.success('Skill 已卸载'); }
        catch (error) { message.error(error instanceof Error ? error.message : '卸载失败'); }
        finally { setPending(''); }
    }
    return <WorkspacePage className="studio-collection-page lib-tv-project-page skill-hub-page">
        <PageHeader title="Skill Hub" />
        <div className="collection-content">
            <div className="skill-hub-toolbar"><p>管理 Agent 的本地技能。启停和更新在下一轮对话生效。</p><Button type="primary" disabled={importBusy} icon={<ArrowUpFromLine size={16} />} onClick={() => chooseFile()}>导入 Skill</Button></div>
            <input ref={fileInput} type="file" accept=".md,.markdown,.zip" hidden onChange={event => {
                const file = event.target.files?.[0];
                if (file) setImporting({ file, target: importTarget.current, selectionId: crypto.randomUUID() });
                event.target.value = '';
            }} />
            {importing ? <SkillImportPanel key={importing.selectionId} file={importing.file} scope={scope} target={importing.target}
                onBusyChange={setImportBusy}
                onChooseFile={() => chooseFile(importing.target)} onClose={() => setImporting(null)}
                onInstalled={() => { setImporting(null); void skills.refetch(); message.success('Skill 已保存，下一轮对话生效'); }} /> : null}
            <div className="skill-hub-filters">
                <Input aria-label="搜索技能" placeholder="搜索名称或用途" prefix={<Search size={16} />} value={search} onChange={event => setSearch(event.target.value)} allowClear />
                <Select aria-label="筛选技能" value={filter} onChange={setFilter} options={[{ value: 'all', label: '全部技能' }, { value: 'enabled', label: '已启用' }, { value: 'disabled', label: '已停用' }, { value: 'builtin', label: '内置技能' }]} />
            </div>
            {skills.isPending ? <Spin /> : null}
            {skills.isError ? <p role="alert">{skills.error.message} <Button onClick={() => void skills.refetch()}>重试</Button></p> : null}
            {!skills.isPending && !skills.isError && !visible.length ? <p className="skill-hub-muted">{search || filter !== 'all' ? '没有符合条件的技能' : '还没有本地技能，点击“导入 Skill”添加。'}</p> : null}
            <ul className="skill-hub-list" aria-label="本地技能列表">
                {visible.map(skill => <li key={skill.id} className="skill-hub-row">
                    <button type="button" className="skill-hub-row-open" aria-label={`查看 ${skill.displayName}`} onClick={() => setDetail(skill)}>
                    <span className="skill-hub-row-icon" aria-hidden="true"><Puzzle size={20} /></span>
                    <span className="skill-hub-row-main">
                        <span className="skill-hub-row-name">{skill.displayName}</span>
                        <span className="skill-hub-row-description">{skill.description}</span>
                        {skill.problem ? <span className="skill-hub-row-problem">{skill.problem}</span> : null}
                    </span>
                    <span className="skill-hub-row-source">{skill.builtin ? '内置技能' : skill.sourceType === 'authored' ? '助手沉淀' : skill.sourceType === 'github' ? 'GitHub' : '本地技能'}</span>
                    <span className="skill-hub-row-version">{skill.version || '未标注版本'}</span>
                    </button>
                    <div className="skill-hub-row-actions">
                        <Button size="small" aria-label={`${skill.enabled ? '停用' : '启用'} ${skill.displayName}`} aria-pressed={skill.enabled} disabled={Boolean(pending) || Boolean(skill.problem)} loading={pending === skill.id} onClick={() => void toggle(skill)}>{skill.problem ? '不可用' : skill.enabled ? '已启用' : '已停用'}</Button>
                        <Dropdown trigger={['click']} menu={{ items: [{ key: 'view', label: '查看技能文件' }, ...(!skill.builtin ? [{ key: 'update', label: '从本地更新' }, { key: 'remove', label: '卸载 Skill', danger: true }] : [])], onClick: ({ key }) => { if (key === 'view') setDetail(skill); if (key === 'update') chooseFile(skill); if (key === 'remove') setRemoving(skill); } }}>
                            <button type="button" className="product-icon-button" aria-label={`${skill.displayName} 的更多操作`} disabled={Boolean(pending) || importBusy}><MoreHorizontal size={18} /></button>
                        </Dropdown>
                    </div>
                </li>)}
            </ul>
        </div>
        {detail ? <SkillFilesModal key={detail.id} skill={detail} scope={scope} onClose={() => setDetail(null)} /> : null}
        <AppModal title="卸载 Skill" open={Boolean(removing)} okText="卸载" cancelText="取消" okButtonProps={{ danger: true }} confirmLoading={Boolean(pending)} onOk={() => void remove()} onCancel={() => { if (!pending) setRemoving(null); }}>
            <p>卸载“{removing?.displayName}”后，Agent 将无法在新对话轮次加载它。正在执行的任务会继续使用原版本。</p>
        </AppModal>
    </WorkspacePage>;
}

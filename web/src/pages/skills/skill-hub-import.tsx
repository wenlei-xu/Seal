import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Input, Spin } from 'antd';
import { assertUserScope, type CapturedUserScope } from '@/lib/user-scope-guard';
import { inspectHubSkill, installHubSkill, type HubPreview, type HubSkill } from '@/services/api/skill-hub';

export function SkillImportPanel({ file, scope, target, onBusyChange, onChooseFile, onClose, onInstalled }: { file: File; scope: CapturedUserScope; target?: HubSkill; onBusyChange: (busy: boolean) => void; onChooseFile: () => void; onClose: () => void; onInstalled: () => void }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [preview, setPreview] = useState<HubPreview | null>(null);
    const [enabled, setEnabled] = useState(true);
    const [replace, setReplace] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [needsMetadata, setNeedsMetadata] = useState(false);
    const operation = useRef(0);
    useEffect(() => {
        onBusyChange(pending);
        return () => onBusyChange(false);
    }, [pending, onBusyChange]);
    useEffect(() => {
        void inspect(file, { name: '', description: '' });
        return () => { operation.current += 1; };
    }, [file, scope]);
    async function inspect(selected: File, metadata = { name, description }) {
        const current = ++operation.current;
        setPending(true); setError(''); setPreview(null);
        try { const result = await inspectHubSkill({ file: selected, ...metadata }, scope); assertUserScope(scope); if (current === operation.current) { setPreview(result); setNeedsMetadata(result.needsMetadata); } }
        catch (reason) { if (current === operation.current) setError(reason instanceof Error ? reason.message : '读取失败'); }
        finally { if (current === operation.current) setPending(false); }
    }
    async function install() {
        if (!file || !preview?.contentHash) return;
        setPending(true); setError('');
        try { await installHubSkill({ file, name, description, contentHash: preview.contentHash, targetId: target?.id || (replace ? preview.existingId : undefined), enabled }, scope); assertUserScope(scope); onInstalled(); }
        catch (reason) { setError(reason instanceof Error ? reason.message : '导入失败'); }
        finally { setPending(false); }
    }
    const conflict = Boolean(preview?.existingId && preview.existingId !== target?.id);
    return <section className="skill-hub-import" aria-label={target ? `更新 ${target.displayName}` : 'Skill 导入预览'}>
            <div className="skill-hub-import-heading"><strong>{target ? `更新 ${target.displayName}` : '导入预览'}</strong><span>{file.name}</span></div>
            {pending && !preview ? <div role="status"><Spin size="small" /> 正在读取文件…</div> : null}
            {needsMetadata ? <>
                <label className="skill-hub-metadata-field">Skill 标识（缺少元数据时填写）<Input disabled={pending} placeholder="例如 my-video-workflow" value={name} onChange={event => { setName(event.target.value); setPreview(null); }} /></label>
                <label className="skill-hub-metadata-field">用途（缺少元数据时填写）<Input.TextArea disabled={pending} rows={2} maxLength={1024} value={description} onChange={event => { setDescription(event.target.value); setPreview(null); }} /></label>
                <Button disabled={pending} onClick={() => void inspect(file)}>读取预览</Button>
            </> : null}
            {preview ? <>
                {preview.needsMetadata ? <p role="status">请补全标识和用途，然后点击“读取预览”。</p> : <p>{preview.name} · {preview.version || '未标注版本'} · {preview.fileCount} 个文件</p>}
                {preview.builtinConflict ? <p role="alert">这个标识属于内置 Skill，请更换包内的 name 后重新导入。</p> : null}
                {conflict && !preview.builtinConflict ? target ? <p role="alert">这个名称已被另一个 Skill 使用，请选择正确的更新文件。</p> : <Checkbox checked={replace} onChange={event => setReplace(event.target.checked)}>更新已安装的同名 Skill（保留启停状态）</Checkbox> : null}
                {!target && !conflict && !preview.needsMetadata ? <Checkbox checked={enabled} onChange={event => setEnabled(event.target.checked)}>安装后启用</Checkbox> : null}
                {target ? <p className="skill-hub-muted">更新会保留当前启停状态，下一轮对话使用新版本。</p> : null}
                <details><summary>查看技能说明</summary><pre className="skill-hub-source">{preview.entry}</pre></details>
            </> : null}
            {error ? <p role="alert">{error}</p> : null}
            <div className="skill-hub-import-actions">
                <Button type="primary" loading={pending} onClick={() => void install()} disabled={!preview?.contentHash || preview.needsMetadata || preview.builtinConflict || (conflict && (!replace || Boolean(target)))}>{target || (conflict && replace) ? '更新 Skill' : '安装 Skill'}</Button>
                <Button disabled={pending} onClick={onChooseFile}>重新选择文件</Button>
                <Button type="text" disabled={pending} onClick={onClose}>取消</Button>
            </div>
    </section>;
}

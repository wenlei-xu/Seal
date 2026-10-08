import { useState } from 'react';
import { Button, Select, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AppModal } from '@/components/ui/product/app-modal';
import type { CapturedUserScope } from '@/lib/user-scope-guard';
import { listHubFiles, readHubFile, type HubSkill } from '@/services/api/skill-hub';
export function SkillFilesModal({ skill, scope, onClose }: { skill: HubSkill; scope: CapturedUserScope; onClose: () => void }) {
    const [path, setPath] = useState('SKILL.md');
    const files = useQuery({ queryKey: ['skill-hub-files', scope.userScope, scope.epoch, skill.id, skill.contentHash], queryFn: ({ signal }) => listHubFiles(skill.id, scope, signal) });
    const content = useQuery({ queryKey: ['skill-hub-file', scope.userScope, scope.epoch, skill.id, skill.contentHash, path], queryFn: ({ signal }) => readHubFile(skill.id, path, scope, signal) });
    return <AppModal title={skill.displayName} open centered onCancel={onClose} footer={null} width={760}><div className="skill-hub-detail">
        <p>{skill.description}</p><p className="skill-hub-muted">{skill.builtin ? '内置技能' : '本地技能'} · {skill.enabled ? '已启用' : '已停用'} · {skill.version || '未标注版本'} · {skill.fileCount} 个文件</p>
        {skill.sourceUrl ? <p className="skill-hub-muted">来源：{skill.sourceUrl}{skill.sourceCommit ? ` · ${skill.sourceCommit.slice(0, 12)}` : ''}</p> : null}
        {skill.problem ? <p role="alert">{skill.problem}</p> : null}
        <Select className="skill-hub-file-select" aria-label="选择技能文件" value={path} onChange={setPath} loading={files.isPending} showSearch options={files.data?.files.map(file => ({ label: `${file.path} (${Math.ceil(file.size / 1024)} KB)`, value: file.path }))} />
        {files.isError ? <p role="alert">{files.error.message} <Button onClick={() => void files.refetch()}>重试</Button></p> : null}
        {content.isPending ? <Spin /> : null}
        {content.isError ? <p role="alert">{content.error.message} <Button onClick={() => void content.refetch()}>重试</Button></p> : null}
        {content.data ? content.data.binary ? <p>这是二进制文件，暂不提供内容预览。</p> : /\.(md|markdown|mdx)$/i.test(path) ? <div className="skill-hub-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ children }) => <span>{children}</span>, img: ({ alt }) => <span>{alt || '图片'}</span> }}>{content.data.content}</ReactMarkdown></div> : <pre className="skill-hub-source">{content.data.content}</pre> : null}
    </div></AppModal>;
}

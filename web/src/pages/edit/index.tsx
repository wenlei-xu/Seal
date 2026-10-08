import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Input, Spin } from 'antd';
import { ArrowLeft, Clapperboard, Pencil, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { CollectionGrid, WorkspacePage, PageHeader } from '@/components/layout/workspace-page';
import { LibraryCardShell } from '@/components/canvas/library-card-shell';
import { AppModal } from '@/components/ui/product/app-modal';
import { captureUserScope, assertUserScope } from '@/lib/user-scope-guard';
import { createEditingProject, listEditingProjects, renameEditingProject, type EditingProject } from '@/services/api/edit-projects';

export default function EditingProjectsPage() {
    const navigate = useNavigate();
    const [scope] = useState(() => captureUserScope());
    const [form, setForm] = useState<{ project?: EditingProject; operationId: string } | null>(null);
    const [title, setTitle] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const projects = useQuery({ queryKey: ['editing-projects', scope.userScope, scope.epoch],
        queryFn: ({ signal }) => listEditingProjects(scope, signal) });
    function open(project?: EditingProject) {
        setTitle(project?.title || '未命名剪辑工程'); setError(''); setForm({ project, operationId: crypto.randomUUID() });
    }
    async function save() {
        if (!form) return;
        setSaving(true); setError('');
        try {
            const project = form.project ? await renameEditingProject(form.project.id, title, scope) : await createEditingProject(title, form.operationId, scope);
            assertUserScope(scope); setForm(null);
            if (form.project) await projects.refetch(); else navigate(`/editing/${project.id}`);
        } catch (reason) { setError(reason instanceof Error ? reason.message : '工程保存失败'); }
        finally { setSaving(false); }
    }
    return <WorkspacePage className="studio-collection-page lib-tv-project-page">
        <PageHeader title="剪辑" leading={
            <button type="button" className="libtv-project-back" onClick={() => navigate('/')} aria-label="返回首页" title="返回首页"><ArrowLeft aria-hidden="true" /></button>
        } />
        <div className="collection-content">
            {projects.isPending ? <Spin /> : null}
            {projects.isError ? <p role="alert">{projects.error.message}<Button type="text" onClick={() => void projects.refetch()}>重试</Button></p> : null}
            <CollectionGrid className="canvas-collection-grid">
                <div className="libtv-create-project-entry">
                    <article className="libtv-create-project-card" role="button" tabIndex={0} onClick={() => open()} onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
                    }}>
                        <div className="libtv-create-project-icon"><Plus aria-hidden="true" /></div>
                        <strong>新建剪辑工程</strong>
                    </article>
                    <p className="libtv-create-project-subtitle">创建新的视频项目</p>
                </div>
                {projects.data?.projects.map(project => <LibraryCardShell
                    key={project.id}
                    className="canvas-collection-card"
                    ariaLabel={`打开剪辑工程 ${project.title}`}
                    title={project.title}
                    updatedAt={project.updatedAt}
                    onOpen={() => navigate(`/editing/${project.id}`)}
                    cover={<div className="canvas-project-empty is-libtv size-full"><Clapperboard className="canvas-project-empty-icon" aria-hidden="true" /></div>}
                    actions={<div className="canvas-collection-actions">
                        <button type="button" className="product-icon-button" aria-label={`重命名 ${project.title}`} title="重命名" onClick={() => open(project)}><Pencil /></button>
                    </div>}
                />)}
            </CollectionGrid>
        </div>
        <AppModal title={form?.project ? '重命名剪辑工程' : '新建剪辑工程'} open={Boolean(form)} onCancel={() => { if (!saving) setForm(null); }}
            onOk={() => void save()} confirmLoading={saving} okText={form?.project ? '保存' : '创建'}>
            <Input aria-label="工程名称" autoFocus maxLength={150} value={title} onChange={event => setTitle(event.target.value)} onPressEnter={() => { if (!saving) void save(); }} />
            {error ? <p role="alert" className="mt-2">{error}</p> : null}
        </AppModal>
    </WorkspacePage>;
}

import { useRef, useState } from 'react';
import { Button } from 'antd';
import { Clapperboard, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { AppModal } from '@/components/ui/product/app-modal';
import { assertUserScope, captureUserScope } from '@/lib/user-scope-guard';
import { ApiError } from '@/services/api/request';
import { appendHypitCandidate, cancelHypitJob, getEditContext, listHypitJobs, publishHypitJob, replaceHypitCandidate } from '@/services/api/edit-projects';
import { EditSceneCandidates } from './edit-scene-candidates';

const statusText = { running: '正在制作', complete: '已完成', failed: '制作失败', cancelled: '已取消', interrupted: '制作中断' };
const commandText = { check: '工程检查', plan: '制作计划', build: '视频制作' };

export function EditProductions({ projectId, editId, onRevision }: { projectId: string; editId: string; onRevision: (revision: number) => void }) {
    const [open, setOpen] = useState(false);
    const [scope] = useState(captureUserScope);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [added, setAdded] = useState<Set<string>>(new Set());
    const operations = useRef(new Map<string, { operationId: string; expectedRevision: number; candidateId: string; replaceSceneId?: string }>());
    const jobs = useQuery({ queryKey: ['hypit-jobs', scope.userScope, scope.epoch, projectId, editId],
        queryFn: ({ signal }) => listHypitJobs(projectId, editId, scope, signal), enabled: open, refetchInterval: open ? 2000 : false });
    async function add(jobId: string, replace = false) {
        setBusy(jobId); setError('');
        try {
            let input = operations.current.get(jobId);
            if (input && Boolean(input.replaceSceneId) !== replace) throw new Error('上次提交还未确认，请先重试同一个操作。');
            if (!input) {
                const candidate = await publishHypitJob(projectId, editId, jobId, scope);
                const context = await getEditContext(projectId, editId, scope);
                assertUserScope(scope);
                let replaceSceneId: string | undefined;
                if (replace) {
                    const envelope = context.selection as { selection?: { sourceFile?: string; target?: { id?: string } } } | null;
                    const selected = envelope?.selection;
                    if (selected?.sourceFile !== 'index.html' || !selected.target?.id) throw new Error('请先在主轨道中选中要替换的片段。');
                    replaceSceneId = selected.target.id;
                }
                input = { candidateId: candidate.candidateId, expectedRevision: context.revision, operationId: crypto.randomUUID(), ...(replaceSceneId ? { replaceSceneId } : {}) };
                operations.current.set(jobId, input);
            }
            const result = input.replaceSceneId ? await replaceHypitCandidate(projectId, editId, { ...input, replaceSceneId: input.replaceSceneId }, scope)
                : await appendHypitCandidate(projectId, editId, input, scope);
            assertUserScope(scope); operations.current.delete(jobId);
            setAdded(previous => new Set(previous).add(jobId)); onRevision(result.revision);
        } catch (reason) {
            if (reason instanceof ApiError && reason.status && reason.status >= 400 && reason.status < 500) operations.current.delete(jobId);
            if (reason instanceof ApiError && reason.reason === 'candidate_already_used') setAdded(previous => new Set(previous).add(jobId));
            setError(reason instanceof Error ? reason.message : '加入轨道失败');
        } finally { setBusy(null); }
    }
    return <>
        <Button type="text" icon={<Clapperboard size={16} />} onClick={() => { setError(''); setOpen(true); }}>制作任务</Button>
        <AppModal open={open} title="制作任务" footer={null} onCancel={() => { if (!busy) setOpen(false); }}>
            <p className="text-sm text-[var(--muted-foreground)]">在创作助手中描述制作需求。完成的结果可加入轨道末尾，再继续剪辑。</p>
            <p className="text-sm text-[var(--muted-foreground)]">替换选中片段会保留它的位置和长度，原内容可以在编辑器中撤销恢复。</p>
            <Button type="text" icon={<RefreshCw size={16} />} onClick={() => void jobs.refetch()}>刷新</Button>
            {jobs.isPending ? <p>正在读取任务…</p> : null}
            {jobs.isError ? <p role="alert">{jobs.error.message}</p> : null}
            {jobs.isSuccess && !jobs.data.length ? <p>还没有制作任务。可以让助手制作动效，或用 @ 引用参考视频开始复刻。</p> : null}
            <div className="flex flex-col gap-3">
                {jobs.data?.map(job => <div key={job.jobId} className="border-b border-[var(--border)] py-3">
                    <div className="flex items-center justify-between gap-3">
                        <span>{commandText[job.command]} · {statusText[job.status]}<br /><small>{new Date(job.createdAt).toLocaleString()}</small></span>
                        {job.status === 'running' ? <Button disabled={Boolean(busy)} onClick={() => {
                            setBusy(job.jobId); setError('');
                            void cancelHypitJob(projectId, editId, job.jobId, scope).then(() => jobs.refetch())
                                .catch(reason => setError(reason instanceof Error ? reason.message : '取消失败')).finally(() => setBusy(null));
                        }}>取消</Button> : job.status === 'complete' && job.command === 'build' ? <div className="flex gap-2">
                            <Button loading={busy === job.jobId} disabled={Boolean(busy) || added.has(job.jobId)} onClick={() => void add(job.jobId)}>{added.has(job.jobId) ? '已加入轨道' : '加入轨道末尾'}</Button>
                            <Button disabled={Boolean(busy) || added.has(job.jobId)} onClick={() => void add(job.jobId, true)}>替换选中片段</Button>
                        </div> : null}
                    </div>
                    {job.error ? <p className="mt-2 break-words text-sm" role="alert">{job.error}</p> : null}
                </div>)}
            </div>
            {error ? <p role="alert">{error}</p> : null}
            {open ? <EditSceneCandidates projectId={projectId} editId={editId} onRevision={onRevision} /> : null}
        </AppModal>
    </>;
}

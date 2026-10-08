import { useRef, useState } from 'react';
import { Button } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { assertUserScope, captureUserScope } from '@/lib/user-scope-guard';
import { ApiError } from '@/services/api/request';
import { checkHyperframesCandidate, getEditContext, listHyperframesCandidates, promoteHyperframesCandidate,
    reviewHyperframesCandidate, type HyperframesReview } from '@/services/api/edit-projects';

export function EditSceneCandidates({ projectId, editId, onRevision }: { projectId: string; editId: string; onRevision: (revision: number) => void }) {
    const [scope] = useState(captureUserScope);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [reviews, setReviews] = useState<Record<string, HyperframesReview>>({});
    const [added, setAdded] = useState<Set<string>>(new Set());
    const operations = useRef(new Map<string, { operationId: string; expectedRevision: number; replaceSceneId?: string }>());
    const candidates = useQuery({ queryKey: ['hyperframes-candidates', scope.userScope, scope.epoch, projectId, editId],
        queryFn: ({ signal }) => listHyperframesCandidates(projectId, editId, scope, signal), refetchInterval: 3000 });
    async function preview(id: string, check = false) {
        setBusy(id); setError('');
        try {
            const result = check ? await checkHyperframesCandidate(projectId, editId, id, scope)
                : await reviewHyperframesCandidate(projectId, editId, id, scope);
            assertUserScope(scope); setReviews(previous => ({ ...previous, [id]: result }));
        } catch (reason) { setError(reason instanceof Error ? reason.message : '读取候选失败'); }
        finally { setBusy(''); }
    }
    async function add(id: string, replace: boolean) {
        setBusy(id); setError('');
        try {
            let input = operations.current.get(id);
            if (input && Boolean(input.replaceSceneId) !== replace) throw new Error('请先重试上一次提交。');
            if (!input) {
                const context = await getEditContext(projectId, editId, scope);
                assertUserScope(scope);
                const selected = (context.selection as { selection?: { sourceFile?: string; target?: { id?: string } } } | null)?.selection;
                if (replace && (selected?.sourceFile !== 'index.html' || !selected.target?.id)) throw new Error('请先在主轨道中选中要替换的片段。');
                input = { operationId: crypto.randomUUID(), expectedRevision: context.revision,
                    ...(replace ? { replaceSceneId: selected?.target?.id } : {}) };
                operations.current.set(id, input);
            }
            const result = await promoteHyperframesCandidate(projectId, editId, { candidateId: id, ...input }, scope);
            assertUserScope(scope); operations.current.delete(id);
            setAdded(previous => new Set(previous).add(id)); onRevision(result.revision);
        } catch (reason) {
            if (reason instanceof ApiError && reason.status && reason.status >= 400 && reason.status < 500) operations.current.delete(id);
            if (reason instanceof ApiError && reason.reason === 'candidate_already_used') setAdded(previous => new Set(previous).add(id));
            setError(reason instanceof Error ? reason.message : '加入轨道失败');
        } finally { setBusy(''); }
    }
    return <section className="mt-4 border-t border-[var(--border)] pt-3">
        <h3 className="text-sm font-medium">动效候选</h3>
        <p className="text-sm text-[var(--muted-foreground)]">查看检查结果和画面后，可将候选加入当前轨道。工程发生变化时，助手保留的结果也会出现在这里。</p>
        {candidates.isPending ? <p>正在读取候选…</p> : null}
        {candidates.isError ? <p role="alert">{candidates.error.message}</p> : null}
        {candidates.data?.filter(candidate => candidate.kind === 'hyperframes').map(candidate => {
            const review = reviews[candidate.candidateId];
            return <div key={candidate.candidateId} className="border-b border-[var(--border)] py-3">
                <p className="text-sm">{candidate.canvas.width} × {candidate.canvas.height} · {candidate.duration} 秒 · 创建于版本 {candidate.baseRevision}</p>
                <div className="flex flex-wrap gap-2">
                    <Button size="small" disabled={Boolean(busy)} onClick={() => void preview(candidate.candidateId)}>查看检查与画面</Button>
                    <Button size="small" loading={busy === candidate.candidateId} disabled={Boolean(busy)} onClick={() => void preview(candidate.candidateId, true)}>重新检查</Button>
                    <Button size="small" disabled={Boolean(busy) || !review?.ok || added.has(candidate.candidateId)} onClick={() => void add(candidate.candidateId, false)}>{added.has(candidate.candidateId) ? '已加入' : '加入轨道末尾'}</Button>
                    <Button size="small" disabled={Boolean(busy) || !review?.ok || added.has(candidate.candidateId)} onClick={() => void add(candidate.candidateId, true)}>替换选中片段</Button>
                </div>
                {review ? <>
                    <p className="mt-2 text-sm" role="status">{review.ok ? '官方检查通过' : '尚未通过检查，请重新检查或让助手修正候选'}</p>
                    <div className="grid grid-cols-2 gap-2">{review.images.map(image => <img key={image.file} alt="动效候选检查画面" src={`data:${image.mimeType};base64,${image.data}`} className="w-full rounded border border-[var(--border)]" />)}</div>
                    {!review.ok && (review.log || review.stderr) ? <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{review.log || review.stderr}</pre> : null}
                </> : null}
            </div>;
        })}
        {error ? <p role="alert">{error}</p> : null}
    </section>;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { App, Button } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { captureUserScope, assertUserScope } from '@/lib/user-scope-guard';
import { useEffectiveConfig } from '@/stores/use-config-store';
import { prepareBackendGenerationTask } from '@/services/api/generation-task';
import { acceptMediaProposal, getMediaProposalTask, listMediaProposals, type MediaProposal } from '@/services/api/creator';
import type { AssistantGenerationProposal } from '@/services/api/agent-assistant';
import { cancelGenerationTask } from '@/services/api/task-center';
import type { CanvasAssistantController } from './use-canvas-assistant';

export function useCreatorMediaActions(projectId: string, onStarted: (id: string) => void) {
    const config = useEffectiveConfig();
    const [scope] = useState(() => captureUserScope());
    const pending = useRef(new Set<string>());
    const [feedback, setFeedback] = useState<Record<string, string>>({});
    const queryClient = useQueryClient();
    const start = useCallback(async (proposal: Pick<MediaProposal, 'proposalId' | 'kind' | 'prompt' | 'modelKey'> | AssistantGenerationProposal) => {
        if (pending.current.has(proposal.proposalId)) return;
        pending.current.add(proposal.proposalId);
        setFeedback(value => ({ ...value, [proposal.proposalId]: '正在提交…' }));
        try {
            const input = await prepareBackendGenerationTask({ projectId, mode: proposal.kind, prompt: proposal.prompt || '',
                config: { ...config, model: proposal.modelKey, count: '1' }, expectedScope: scope });
            assertUserScope(scope);
            const task = await acceptMediaProposal(projectId, proposal.proposalId, input, scope);
            assertUserScope(scope);
            onStarted(proposal.proposalId);
            setFeedback(value => ({ ...value, [proposal.proposalId]: `已提交任务 ${task.id}` }));
            await queryClient.invalidateQueries({ queryKey: ['creator-media', scope.userScope, scope.epoch, projectId] });
        } catch (error) { setFeedback(value => ({ ...value, [proposal.proposalId]: error instanceof Error ? error.message : '提交失败' })); }
        finally { pending.current.delete(proposal.proposalId); }
    }, [projectId, onStarted, config, scope, queryClient]);
    return { start, feedback };
}

export function CreatorMediaTasks({ assistant, onStart, feedback }: { assistant: CanvasAssistantController; onStart: (proposal: MediaProposal) => void; feedback: Record<string, string> }) {
    const [scope] = useState(() => captureUserScope());
    const proposals = useQuery({ queryKey: ['creator-media', scope.userScope, scope.epoch, assistant.projectId],
        queryFn: ({ signal }) => listMediaProposals(assistant.projectId, scope, signal), enabled: assistant.open && Boolean(assistant.projectId),
        refetchInterval: assistant.streaming ? 3000 : false });
    useEffect(() => { if (assistant.open && assistant.projectId && !assistant.streaming) void proposals.refetch(); }, [assistant.open, assistant.projectId, assistant.streaming, assistant.turns.length]);
    if (!proposals.data?.items.length) return proposals.isError ? <p role="alert">制作任务读取失败：{proposals.error.message}</p> : null;
    return <details className="canvas-assistant-card"><summary>制作任务 · {proposals.data.items.length}</summary>
        {proposals.data.items.map(item => item.taskId ? <CreatorMediaTask key={item.proposalId} item={item} assistant={assistant} /> :
            <div key={item.proposalId} className="space-y-2 border-t border-[var(--border)] py-3 text-sm">
                <p>{item.kind === 'audio' ? '配音' : item.kind === 'video' ? '生成视频' : '生成图片'} · {item.model}</p>
                <p className="whitespace-pre-wrap break-words">{item.prompt}</p><p className="canvas-assistant-meta">确认后按所选渠道计费，结果保存到资产库。</p>
                <Button size="small" disabled={assistant.streaming} onClick={() => onStart(item)}>确认并生成</Button>
                {feedback[item.proposalId] ? <p role="status">{feedback[item.proposalId]}</p> : null}
            </div>)}
    </details>;
}

function CreatorMediaTask({ item, assistant }: { item: MediaProposal; assistant: CanvasAssistantController }) {
    const { message } = App.useApp();
    const [scope] = useState(() => captureUserScope());
    const [cancelling, setCancelling] = useState(false);
    const task = useQuery({ queryKey: ['creator-media-task', scope.userScope, scope.epoch, item.projectId, item.taskId],
        queryFn: ({ signal }) => getMediaProposalTask(item.projectId, item.taskId!, scope, signal),
        refetchInterval: query => { const value = query.state.data; return !value || ['queued', 'running'].includes(value.status) || value.status === 'succeeded' && value.resultState !== 'READY' && !value.resultState?.startsWith('FAILED') ? 3000 : false; } });
    const data = task.data;
    const active = data?.status === 'running' || data?.status === 'queued';
    const assetIDs = data?.outputs?.flatMap(output => output.materializedAssetId ? [output.materializedAssetId] : []) || [];
    async function cancel() {
        setCancelling(true);
        try { assertUserScope(scope); await cancelGenerationTask(item.taskId!); assertUserScope(scope); await task.refetch(); }
        catch (error) { message.error(error instanceof Error ? error.message : '取消失败'); } finally { setCancelling(false); }
    }
    return <div className="space-y-2 border-t border-[var(--border)] py-3 text-sm">
        <p>{item.kind === 'audio' ? '配音' : item.kind === 'video' ? '视频' : '图片'} · {item.model}</p>
        <p role="status">{task.isError ? task.error.message : data ? `${data.stage || data.status} · ${data.progress || 0}%` : '读取任务…'}</p>
        {data?.error ? <p role="alert">{data.error}</p> : null}
        {active ? <Button size="small" loading={cancelling} onClick={() => void cancel()}>取消制作</Button> : null}
        {assetIDs.length ? <Button size="small" disabled={assistant.streaming || assistant.sessionBusy} onClick={() => void assistant.send(`继续使用制作任务 ${item.taskId} 已完成的素材完成原来的要求。先读取现有结果，复用已有素材，不要重复生成。`, [], assetIDs.map(id => ({ kind: 'asset' as const, id })))}>让助手继续处理结果</Button> : null}
        {task.isError ? <Button size="small" onClick={() => void task.refetch()}>重新读取</Button> : null}
    </div>;
}

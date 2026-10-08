import { App, Button, Dropdown, Tooltip } from "antd";
import { History, MessageSquarePlus, X, Clapperboard, ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { WorkingDots } from "@/components/ai/working-indicator";
import { CanvasAssistantHistory } from "./canvas-assistant-history";
import { AssistantToolActivityView } from "./assistant-tool-activity-view";

import { AppDrawer } from "@/components/ui/product/app-drawer";
import { referencedAssetIdsInPrompt, type CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import type { AssistantGenerationProposal } from "@/services/api/agent-assistant";
import { ASSISTANT_STARTER_PROMPTS, assistantStatusNotice } from "./canvas-assistant-copy";
import { CanvasAssistantComposer } from "./canvas-assistant-composer";
import { CanvasAssistantReply, CanvasAssistantUserMessage } from "./canvas-assistant-turn";
import { ASSISTANT_MAX_WIDTH, ASSISTANT_MIN_WIDTH, type CanvasAssistantController } from "./use-canvas-assistant";
import "./canvas-assistant-sidebar.css";
import { CreatorMediaTasks, useCreatorMediaActions } from './creator-media-tasks';
import { captureUserScope, assertUserScope } from '@/lib/user-scope-guard';
import { getMediaProposalTask } from '@/services/api/creator';
import type { AssistantTurn, AssistantWorkflow } from '@/services/api/agent-assistant';
import type { HubSkill } from '@/services/api/skill-hub';

type Props = {
    assistant: CanvasAssistantController;
    canvasTitle: string;
    dockable: boolean;
    readOnly: boolean;
    selectedNodeIds: string[];
    references: CanvasResourceReference[];
    includeAssetLibrary?: boolean;
    workspaceLabel?: string;
    referencesLabel?: string;
    onLocateNodes: (nodeIds: string[]) => void;
    onRunProposal: (proposal: AssistantGenerationProposal) => void;
    onOpenModelSettings: () => void;
    proposalFeedback?: Record<string, string>;
    proposalActionLabel?: string;
    prefill?: { id: string; text: string };
};

export function CanvasAssistantSidebar(props: Props) {
    const { assistant, canvasTitle, dockable, readOnly, selectedNodeIds, references, onLocateNodes, onRunProposal, onOpenModelSettings } = props;
    const mediaActions = useCreatorMediaActions(assistant.projectId, assistant.markProposalHandled);
    const callbacksRef = useRef({ onLocateNodes, onRunProposal });
    callbacksRef.current = { onLocateNodes, onRunProposal };
    const locateNodes = useCallback((ids: string[]) => callbacksRef.current.onLocateNodes(ids), []);
    const { message } = App.useApp();
    const [scope] = useState(() => captureUserScope());
    const [resuming, setResuming] = useState(false);
    const resume = useCallback(async (workflow: AssistantWorkflow, turn: AssistantTurn) => {
        if (resuming || assistant.streaming || assistant.sessionBusy) return;
        setResuming(true);
        try {
            const assetIDs = new Set<string>();
            for (const step of workflow.steps) if (step.taskId && step.taskKind === 'generation') {
                const task = await getMediaProposalTask(assistant.projectId, step.taskId, scope);
                for (const output of task.outputs || []) if (output.materializedAssetId) assetIDs.add(output.materializedAssetId);
            }
            assertUserScope(scope);
            await assistant.send(`继续已保存的任务 ${workflow.id}：${workflow.goal}。先用 workflow_read 读取最新步骤，核对原任务、候选和文件摘要，复用现有结果，从未完成处继续；不要重复提交已受理的生成或重复加入轨道。`, [],
                [...(turn.references || []), ...[...assetIDs].map(id => ({ kind: 'asset' as const, id }))]);
        } catch (error) { message.error(error instanceof Error ? error.message : '继续任务失败'); }
        finally { setResuming(false); }
    }, [resuming, assistant.streaming, assistant.sessionBusy, assistant.projectId, assistant.send, scope, message]);
    const resumeWorkflow = useCallback((workflow: AssistantWorkflow, turn: AssistantTurn) => { void resume(workflow, turn); }, [resume]);
    const runProposal = useCallback((proposal: AssistantGenerationProposal) => {
        if (proposal.assetGeneration) void mediaActions.start(proposal); else callbacksRef.current.onRunProposal(proposal);
    }, [mediaActions.start]);
    const proposalFeedback = useMemo(() => ({ ...props.proposalFeedback, ...mediaActions.feedback }), [props.proposalFeedback, mediaActions.feedback]);
    const undoTurn = useCallback((turnId: string) => { void assistant.undoTurn(turnId); }, [assistant.undoTurn]);
    const [draft, setDraft] = useState("");
    const [selectedSkill, setSelectedSkill] = useState<HubSkill | null>(null);
    useEffect(() => { setSelectedSkill(null); }, [assistant.projectId]);
    useEffect(() => { if (props.prefill) setDraft(props.prefill.text); }, [props.prefill]);
    const [selectionAttached, setSelectionAttached] = useState(true);
    const logRef = useRef<HTMLDivElement | null>(null);
    const logContentRef = useRef<HTMLDivElement | null>(null);
    const sidebarRef = useRef<HTMLDivElement | null>(null);
    const followLatestRef = useRef(true);
    const [showLatest, setShowLatest] = useState(false);
    useLayoutEffect(() => {
        followLatestRef.current = true;
        setShowLatest(false);
    }, [assistant.projectId, assistant.sessionId]);
    useEffect(() => {
        const content = logContentRef.current;
        if (!content) return;
        let frame = 0;
        const observer = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const log = logRef.current;
                if (log && followLatestRef.current) log.scrollTop = log.scrollHeight;
            });
        });
        observer.observe(content);
        return () => { observer.disconnect(); cancelAnimationFrame(frame); };
    }, [dockable, assistant.open]);

    // 新的一条选择又可以被带上：用户移除只对当前这条消息生效。
    useEffect(() => {
        setSelectionAttached(true);
    }, [selectedNodeIds.join(",")]);

    const turnCount = assistant.turns.length;
    useLayoutEffect(() => {
        const node = logRef.current;
        if (node && followLatestRef.current) node.scrollTop = node.scrollHeight;
    }, [turnCount, assistant.streamed, assistant.pendingUserText, assistant.lifecycleNotice, assistant.toolActivity, proposalFeedback]);

    const notice = assistant.status && !assistant.status.available && assistant.status.reason !== "host_starting" ? assistantStatusNotice(assistant.status.reason) : null;
    const composerDisabled = readOnly;
    const composerReason = readOnly ? "这个画布是只读的，不能让助手改动。" : undefined;
    const attachedIds = selectionAttached ? selectedNodeIds : [];

    const send = useCallback(() => {
        const text = draft;
        if (!text.trim() || readOnly || assistant.streaming || assistant.sessionBusy) return;
        followLatestRef.current = true;
        setDraft("");
        setSelectedSkill(null);
        // @ 引用到的素材库素材由界面按用户原文推导后交给后端校验归属：
        // 模型不能自己声明要读哪些素材。
        const assetReferences = referencedAssetIdsInPrompt(text)
            .map((id) => ({ kind: "asset" as const, id }));
        void assistant.send(text, attachedIds, assetReferences, selectedSkill ?? undefined);
    }, [assistant, attachedIds, draft, readOnly, selectedSkill]);

    const startResize = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = sidebarRef.current?.getBoundingClientRect().width ?? assistant.width;
        const move = (moveEvent: PointerEvent) => assistant.setWidth(startWidth + (startX - moveEvent.clientX));
        const done = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", done);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", done);
    }, [assistant]);

    const sessionItems = assistant.sessions.length
        ? assistant.sessions.map((session) => ({
              key: session.sessionId,
              label: session.title || "还没有内容的对话",
              onClick: () => void assistant.activateSession(session.sessionId),
          }))
        : [{ key: "empty", label: "还没有别的对话", disabled: true }];

    const content = (
        <div className="canvas-assistant-panel" data-canvas-no-zoom>
            <header className="canvas-assistant-header">
                <div className="canvas-assistant-heading"><h2>创作助手</h2><span title={canvasTitle}>{canvasTitle}</span></div>
                <Tooltip title="新对话">
                    <Button type="text" size="small" aria-label="新对话" disabled={assistant.streaming || assistant.sessionBusy} icon={<MessageSquarePlus className="size-4" />} onClick={() => void assistant.startNewSession()} />
                </Tooltip>
                <Dropdown trigger={["click"]} placement="bottomRight" menu={{ items: sessionItems, selectedKeys: assistant.sessionId ? [assistant.sessionId] : [] }}>
                    <Button type="text" size="small" aria-label="历史对话" disabled={assistant.streaming || assistant.sessionBusy} icon={<History className="size-4" />} />
                </Dropdown>
                <Tooltip title="关闭助手">
                    <Button type="text" size="small" aria-label="关闭助手" icon={<X className="size-4" />} onClick={() => assistant.setOpen(false)} />
                </Tooltip>
            </header>

            {notice ? (
                <div className="canvas-assistant-notice" role="status">
                    <span>{notice.text}</span>
                    {notice.action === "model-settings" ? (
                        <Button size="small" onClick={onOpenModelSettings}>{notice.actionLabel}</Button>
                    ) : notice.action === "retry" ? (
                        <Button size="small" loading={assistant.statusBusy} onClick={() => void assistant.restartHost()}>{notice.actionLabel}</Button>
                    ) : null}
                </div>
            ) : null}

            <div ref={logRef} className="canvas-assistant-log" tabIndex={0} aria-label="对话记录" onScroll={() => {
                const node = logRef.current;
                if (node) {
                    followLatestRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
                    setShowLatest(!followLatestRef.current);
                }
            }}>
                <div ref={logContentRef} className="canvas-assistant-log-content">
                {assistant.historyError ? <div className="canvas-assistant-notice" role="status"><span>{assistant.historyError}</span><Button size="small" onClick={() => void assistant.reloadHistory()}>重新读取</Button></div> : !assistant.historyLoaded ? <p className="canvas-assistant-meta" role="status">正在读取对话…</p> : null}
                {assistant.historyLoaded && turnCount === 0 && !assistant.pendingUserText ? (
                    <div className="canvas-assistant-empty">
                        <Clapperboard className="canvas-assistant-empty-icon" aria-hidden="true" />
                        <h3>让想法成为画面</h3>
                        <p>从一句灵感开始，一起完善这张画布。</p>
                        {ASSISTANT_STARTER_PROMPTS.map((prompt) => (
                            <button key={prompt} type="button" className="canvas-assistant-starter" onClick={() => setDraft(prompt)}>
                                <span>{prompt}</span><ArrowUpRight size={14} aria-hidden="true" />
                            </button>
                        ))}
                    </div>
                ) : null}

                    <CanvasAssistantHistory
                        turns={assistant.turns}
                        turnStatus={assistant.turnStatus}
                        logRef={logRef}
                        projectId={assistant.projectId}
                        resumeDisabled={resuming || assistant.streaming || assistant.sessionBusy || readOnly}
                        onResumeWorkflow={resumeWorkflow}
                        handledProposals={assistant.handledProposals}
                        proposalFeedback={proposalFeedback}
                        onLocate={locateNodes}
                          onUndo={undoTurn}
                        onRunProposal={runProposal}
                        proposalActionLabel={props.proposalActionLabel}
                        onDismissProposal={assistant.markProposalDismissed}
                    />
                <CreatorMediaTasks assistant={assistant} onStart={proposal => void mediaActions.start(proposal)} feedback={mediaActions.feedback} />

                {assistant.pendingUserText ? (
                    <div className="canvas-assistant-turn">
                        <CanvasAssistantUserMessage text={assistant.pendingUserText} selectedCount={assistant.pendingSelectedNodeIds.length} requestedSkill={assistant.pendingRequestedSkill} />
                        <AssistantToolActivityView items={assistant.toolActivity} live={assistant.streaming} />
                        {assistant.streamed ? <CanvasAssistantReply text={assistant.streamed} isStreaming={assistant.streaming} /> : null}
                        {assistant.streaming ? (
                            <p className="canvas-assistant-meta canvas-assistant-working" role="status"><WorkingDots dotSize={3} /><span>{assistant.lifecycleNotice || (assistant.streamed ? "助手正在回复…" : "助手正在处理…")}</span></p>
                        ) : null}
                    </div>
                ) : null}

                {assistant.error ? (
                    <div className="canvas-assistant-card">
                        <span className="canvas-assistant-failed">{assistant.error}</span>
                        <div className="canvas-assistant-card-actions">
                            {assistant.canRetry ? <Button size="small" onClick={assistant.retryLast}>重试</Button> : null}
                            {!assistant.canRetry && !assistant.historyError ? <Button size="small" onClick={() => void assistant.reloadHistory()}>重新读取</Button> : null}
                            <Button size="small" type="text" onClick={assistant.dismissError}>知道了</Button>
                        </div>
                    </div>
                ) : null}
                </div>
            </div>
            {showLatest ? <Button className="canvas-assistant-latest" size="small" onClick={() => {
                followLatestRef.current = true;
                setShowLatest(false);
                const log = logRef.current;
                if (log) log.scrollTop = log.scrollHeight;
            }}>回到最新消息</Button> : null}

            <CanvasAssistantComposer
                value={draft}
                onChange={setDraft}
                onSend={send}
                onStop={() => void assistant.stop()}
                streaming={assistant.streaming}
                disabled={composerDisabled}
                disabledReason={composerReason}
                references={references}
                includeAssetLibrary={props.includeAssetLibrary}
                workspaceLabel={props.workspaceLabel}
                referencesLabel={props.referencesLabel}
                selectedCount={selectedNodeIds.length}
                selectionAttached={selectionAttached}
                onDetachSelection={() => setSelectionAttached(false)}
                modelBusy={assistant.modelBusy}
                selectedSkill={selectedSkill}
                onSelectSkill={setSelectedSkill}
            />
        </div>
    );

    if (!dockable) {
        return (
            <AppDrawer
                flush
                open={assistant.open}
                placement="right"
                title={null}
                closable={false}
                onClose={() => assistant.setOpen(false)}
                size="min(380px, 92vw)"
                aria-label="助手"
            >
                {content}
            </AppDrawer>
        );
    }

    return (
        <aside ref={sidebarRef} className="canvas-assistant-sidebar" aria-label="助手" style={{ width: assistant.width, flexBasis: assistant.width }}>
            <button
                type="button"
                className="canvas-assistant-resize"
                aria-label="调整助手宽度"
                onPointerDown={startResize}
                onKeyDown={(event) => {
                    if (event.key === "ArrowLeft") assistant.setWidth(Math.min(ASSISTANT_MAX_WIDTH, assistant.width + 16));
                    if (event.key === "ArrowRight") assistant.setWidth(Math.max(ASSISTANT_MIN_WIDTH, assistant.width - 16));
                }}
            />
            {content}
        </aside>
    );
}

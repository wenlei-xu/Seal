import { memo, useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { AssistantTurn } from "@/services/api/agent-assistant";
import type { AssistantTurnStatus } from "./use-canvas-assistant";
import { CanvasAssistantTurnView, type AssistantTurnViewProps } from "./canvas-assistant-turn";

type Props = Omit<AssistantTurnViewProps, "turn" | "status"> & {
    turns: AssistantTurn[];
    turnStatus: Record<string, AssistantTurnStatus>;
    logRef: RefObject<HTMLDivElement | null>;
};

/** 流式正文不改变这里的 props；长历史只挂载当前可见回合。 */
export const CanvasAssistantHistory = memo(function CanvasAssistantHistory({ turns, turnStatus, logRef, ...viewProps }: Props) {
    const rootRef = useRef<HTMLDivElement>(null);
    const [scrollMargin, setScrollMargin] = useState(0);
    const virtual = turns.length >= 30;
    const getScrollElement = useCallback(() => logRef.current, [logRef]);
    const getItemKey = useCallback((index: number) => turns[index].turnId, [turns]);
    const rows = useVirtualizer({ count: turns.length, getScrollElement, getItemKey, estimateSize: () => 280,
        enabled: virtual, overscan: 4, scrollMargin, useAnimationFrameWithResizeObserver: true });
    useLayoutEffect(() => {
        const root = rootRef.current, log = logRef.current;
        if (!root || !log) return;
        const measure = () => setScrollMargin(root.getBoundingClientRect().top - log.getBoundingClientRect().top + log.scrollTop);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(log);
        // 包含历史读取提示、任务状态等前置内容，变化后重新计算滚动偏移。
        if (root.parentElement) observer.observe(root.parentElement);
        return () => observer.disconnect();
    }, [logRef, virtual]);

    return <div ref={rootRef} className="canvas-assistant-history" style={virtual ? { height: rows.getTotalSize(), position: "relative" } : undefined}>
        {(virtual ? rows.getVirtualItems() : turns.map((_, index) => ({ index, key: turns[index].turnId, start: 0 }))).map(row => (
            <div key={row.key} data-index={row.index} data-assistant-turn-id={turns[row.index].turnId}
                ref={virtual ? rows.measureElement : undefined}
                style={virtual ? { position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${row.start - scrollMargin}px)` } : undefined}>
                <CanvasAssistantTurnView {...viewProps} turn={turns[row.index]} status={turnStatus[turns[row.index].turnId]} />
            </div>
        ))}
    </div>;
});

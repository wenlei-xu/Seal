import { Check, CircleAlert, CircleDashed, LoaderCircle, ChevronDown } from "lucide-react";
import { memo } from "react";
import type { AssistantToolActivity } from "@/services/api/agent-assistant";
import { toolActivityLabel } from "./assistant-tool-activity";

const statusLabels = { running: "执行中", completed: "已完成", error: "未完成", interrupted: "结束状态未确认" };
const icons = { running: LoaderCircle, completed: Check, error: CircleAlert, interrupted: CircleDashed };

export const AssistantToolActivityView = memo(function AssistantToolActivityView({ items, live = false }: { items: AssistantToolActivity[]; live?: boolean }) {
    if (!items.length) return null;
    const running = items.filter(item => item.status === "running");
    const failures = items.filter(item => item.status === "error" || item.status === "interrupted");
    const latest = running.at(-1);
    return <details className="canvas-assistant-tool-activity" open={live ? true : undefined}>
        <summary>
            {latest ? <LoaderCircle size={14} className="canvas-assistant-tool-spinning" aria-hidden /> : failures.length ? <CircleAlert size={14} aria-hidden /> : <Check size={14} aria-hidden />}
            <span>{latest ? toolActivityLabel(latest.tool) : `执行记录 · ${items.length} 项${failures.length ? `，${failures.length} 项需核对` : ""}`}</span>
            <ChevronDown size={14} className="canvas-assistant-tool-chevron" aria-hidden />
        </summary>
        <ol aria-label={live ? "实时执行进度" : "工具执行记录"}>
            {items.map(item => {
                const Icon = icons[item.status];
                return <li key={item.toolCallId} data-tool-status={item.status}>
                    <Icon size={14} className={item.status === "running" ? "canvas-assistant-tool-spinning" : undefined} aria-hidden />
                    <span>{toolActivityLabel(item.tool)}</span><small>{item.status === "running" && item.updated ? "正在处理结果" : statusLabels[item.status]}</small>
                </li>;
            })}
        </ol>
    </details>;
});

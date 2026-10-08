import { Select } from "antd";
import { assistantModelOptions, normalizeAssistantModel } from "@/lib/assistant-model";
import { filterModelsByCapability, modelDisplayName, modelOptionsFromChannels, resolveModelChannel, type AiConfig, type ModelCapability } from "@/stores/use-config-store";
import type { DefaultModelKey } from "./model-default-grid";

export function ModelChannelDefaults({ config, capability, onChange }: { config: AiConfig; capability: ModelCapability; onChange: (key: DefaultModelKey, model: string) => void }) {
    const models = filterModelsByCapability(modelOptionsFromChannels(config.channels), capability, config.channels);
    const rows: Array<{ key: DefaultModelKey; title: string; helper: string; models: string[] }> = capability === "text" ? [
        { key: "assistantModel", title: "Agent 模型", helper: "负责对话、规划与工具调用", models: assistantModelOptions(config) },
        { key: "textModel", title: "默认文本模型", helper: "用于文案、脚本等文字生成", models },
    ] : [
        { key: capability === "image" ? "imageModel" : capability === "video" ? "videoModel" : "audioModel", title: capability === "image" ? "默认生图模型" : capability === "video" ? "默认视频模型" : "默认配音模型", helper: capability === "image" ? "用于画布生图与 Agent 图片生成" : capability === "video" ? "用于画布生视频与 Agent 视频生成" : "用于配音与音频生成", models },
    ];
    return <section className="model-channel-defaults" aria-label="默认模型">
        {rows.map((row) => {
            const assistant = row.key === "assistantModel";
            const selection = assistant ? normalizeAssistantModel(config, config.assistantModel) : config[row.key];
            const unavailable = Boolean(config[row.key] && !row.models.includes(selection));
            const options = row.models.map((model) => ({ value: model, label: `${modelDisplayName(config, model)} · ${resolveModelChannel(config, model).name || "未命名渠道"}` }));
            if (assistant) options.unshift({ value: "", label: "跟随默认文本模型" });
            return <div className="model-channel-default-row" key={row.key}>
                <div><h2>{row.title}</h2><p>{unavailable ? "原模型当前不可用，请重新选择" : row.helper}</p></div>
                <Select aria-label={row.title} showSearch={{ optionFilterProp: "label" }} value={assistant && !config.assistantModel ? "" : row.models.includes(selection) ? selection : undefined} placeholder="选择模型" options={options} onChange={(model) => onChange(row.key, model)} notFoundContent="请先添加并启用对应渠道的模型" />
            </div>;
        })}
    </section>;
}

import { filterModelsByCapability, encodeChannelModel, modelOptionName, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";

export type ModelChannelCategory = "text" | "image" | "video" | "audio" | "asr";
export const MODEL_CHANNEL_CATEGORIES = [
    { value: "text", label: "文字" },
    { value: "image", label: "图片" },
    { value: "video", label: "视频" },
    { value: "audio", label: "语音" },
    { value: "asr", label: "ASR" },
] as const;

export function channelModelsForCapability(channel: ModelChannel, capability: ModelCapability) {
    return filterModelsByCapability(channel.models.map((model) => encodeChannelModel(channel.id, model)), capability, [channel]).map(modelOptionName);
}

// Editing one category must retain the profiles of other categories and
// deselected catalog entries, including their provider-specific options.
export function mergeCategoryModelProfiles(channel: ModelChannel, profiles: NonNullable<ModelChannel["modelProfiles"]>) {
    const byModel = new Map((channel.modelProfiles || []).map((profile) => [profile.model, profile]));
    for (const profile of profiles) byModel.set(profile.model, profile);
    return [...byModel.values()];
}

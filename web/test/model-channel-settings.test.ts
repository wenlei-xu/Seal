import { expect, test } from "bun:test";
import { channelModelsForCapability, mergeCategoryModelProfiles } from "../src/lib/model-channel-settings";
import { serviceModelProfile } from "../src/lib/model-service-presets";
import { createModelChannel, defaultConfig, modelOptionsFromChannels, normalizeConfigSnapshot } from "../src/stores/use-config-store";
import type { ModelProtocolDefinition } from "../src/lib/model-protocols";

test("category edits retain another model's protocol, references and vendor defaults", () => {
    const channel = createModelChannel({ id: "shared", models: ["opaque-picture", "opaque-movie"], modelProfiles: [
        { model: "opaque-picture", capability: "image", protocol: "gemini-image", defaultOptions: { quality: "custom" } },
        { model: "opaque-movie", capability: "video", protocol: "volcengine-ark-video", defaultOptions: { providerFlag: false } },
    ] });
    expect(channelModelsForCapability(channel, "image")).toEqual(["opaque-picture"]);
    expect(channelModelsForCapability(channel, "video")).toEqual(["opaque-movie"]);
    const profiles = mergeCategoryModelProfiles(channel, [{ ...channel.modelProfiles![1], displayName: "新名称" }]);
    expect(profiles.find((profile) => profile.model === "opaque-picture")).toEqual(channel.modelProfiles![0]);
    expect(profiles.find((profile) => profile.model === "opaque-movie")?.defaultOptions).toEqual({ providerFlag: false });
});

test("disabled channels keep their configuration but disappear from creation choices", () => {
    const inactive = createModelChannel({ id: "off", enabled: false, models: ["movie"], modelProfiles: [{ model: "movie", capability: "video", protocol: "newapi" }] });
    const active = createModelChannel({ id: "on", models: ["other-movie"], modelProfiles: [{ model: "other-movie", capability: "video", protocol: "volcengine-ark-video" }] });
    expect(channelModelsForCapability(inactive, "video")).toEqual(["movie"]);
    expect(modelOptionsFromChannels([inactive, active])).toEqual(["on::other-movie"]);
    const restored = normalizeConfigSnapshot({ config: { ...defaultConfig, channels: [inactive, active], videoModel: "off::movie" } }).config;
    expect(restored.channels[0].models).toEqual(["movie"]);
    expect(restored.videoModel).toBe("on::other-movie");
});

test("unknown video APIs require an explicit installed contract, metadata can identify one", () => {
    const channel = createModelChannel({ baseUrl: "https://custom.example.com/v1" });
    const protocols: ModelProtocolDefinition[] = [{ value: "newapi", label: "OpenAI Videos", capability: "video", create: "/v1/videos", contentType: "multipart/form-data", media: "plugin", enabled: true }];
    expect(serviceModelProfile(channel, { id: "video-a" }, protocols, "video").protocol).toBeUndefined();
    const veo = { value: "gemini-veo", label: "Veo", capability: "video", create: "predictLongRunning", contentType: "application/json", media: "plugin", enabled: true } as ModelProtocolDefinition;
    expect(serviceModelProfile({ ...channel, apiFormat: "gemini" }, { id: "video-a" }, [...protocols, veo], "video").protocol).toBeUndefined();
    expect(serviceModelProfile(channel, { id: "video-a", supportedEndpointTypes: ["openai-video"] }, protocols, "video").protocol).toBe("newapi");
});

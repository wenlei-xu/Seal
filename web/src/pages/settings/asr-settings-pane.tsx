import { useEffect, useState } from "react";
import { App, Button, Input, Select, Spin, Switch } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { captureUserScope } from "@/lib/user-scope-guard";
import { getAsrRuntimeStatus, saveAsrSettings, type AsrSettings } from "@/services/api/creator";

export function AsrSettingsPane() {
    const { message } = App.useApp();
    const [scope] = useState(() => captureUserScope());
    const queryClient = useQueryClient();
    const queryKey = ["asr-runtime", scope.userScope, scope.epoch];
    const status = useQuery({ queryKey, queryFn: ({ signal }) => getAsrRuntimeStatus(scope, signal) });
    const [draft, setDraft] = useState<AsrSettings>();
    const [dirty, setDirty] = useState(false);
    useEffect(() => { if (status.data && !dirty) setDraft(status.data.settings); }, [status.data, dirty]);
    const change = (values: Partial<AsrSettings>) => { setDraft((current) => current ? { ...current, ...values } : current); setDirty(true); };
    const save = useMutation({ mutationFn: (settings: AsrSettings) => saveAsrSettings(settings, scope), onSuccess: (result) => {
        queryClient.setQueryData(queryKey, result); setDraft(result.settings); setDirty(false); message.success("ASR 配置已保存");
    }, onError: (error: Error) => message.error(error.message) });
    return <section className="asr-settings-pane">
        <div className="model-channel-heading"><div><h2>语音识别（ASR）</h2></div><Button size="small" loading={status.isFetching} disabled={dirty} onClick={() => void status.refetch()}>刷新状态</Button></div>
        <p className="model-settings-hint">识别素材中的台词，供 Agent 定位口播、剪辑和制作字幕。</p>
        {status.isPending && <Spin size="small" />}
        {status.isError && <p role="alert">{status.error.message}</p>}
        {status.data && draft && <>
            <div className="asr-local-status"><strong>{status.data.model}</strong><span>{status.data.localReady ? "本地模型已就绪" : "本地运行包未就绪"} · {status.data.modelBytes > 0 ? `${(status.data.modelBytes / 1024 / 1024).toFixed(1)} MiB` : "约 142 MiB"}</span><p>离线运行，无需 API Key。支持多语言，提供句段和近似 token 时间戳。</p></div>
            <div className="model-settings-field-grid">
                <label>默认识别方式<Select aria-label="默认识别方式" disabled={save.isPending} value={draft.defaultRoute} options={[{ value: "auto", label: "自动（优先本地）" }, { value: "local", label: "本地 Whisper Base" }, { value: "service", label: "在线识别服务" }]} onChange={(value) => change({ defaultRoute: value })} /></label>
                <label>默认识别语言<Select aria-label="默认识别语言" disabled={save.isPending} value={draft.language} options={[{ value: "", label: "自动识别语言" }, { value: "zh", label: "中文" }, { value: "en", label: "英语" }, { value: "ja", label: "日语" }, { value: "ko", label: "韩语" }]} onChange={(value) => change({ language: value })} /></label>
            </div>
            <div className="asr-service-heading"><h3>在线识别服务</h3><Switch aria-label="启用在线识别" checked={draft.serviceEnabled} disabled={save.isPending} onChange={(value) => change({ serviceEnabled: value })} /></div>
            <p className="model-settings-hint">使用内置 Whisper Base 无需开启此项。需要在线识别时，选择供应商并填写服务配置。</p>
            <div className="asr-presets" aria-label="ASR 供应商预设">
                <Button disabled={save.isPending} onClick={() => change({ serviceType: "openai", baseUrl: "https://api.openai.com/v1", model: "whisper-1", apiKey: "", hasApiKey: false, serviceEnabled: true })}>OpenAI</Button>
                <Button disabled={save.isPending} onClick={() => change({ serviceType: "openai", baseUrl: "", model: "whisper-1", apiKey: "", hasApiKey: false, serviceEnabled: true })}>自定义兼容服务</Button>
            </div>
            {draft.serviceType === "openai" && <fieldset disabled={save.isPending} className="asr-service-fields">
                <div className="model-settings-field-grid">
                    <label>转写模型<Input aria-label="转写模型" value={draft.model} onChange={(event) => change({ model: event.target.value })} placeholder="whisper-1" /></label>
                </div>
                <label className="model-settings-wide-field">基础地址<Input aria-label="ASR 基础地址" value={draft.baseUrl} placeholder="https://api.example.com/v1" onChange={(event) => change({ baseUrl: event.target.value })} /></label>
                <label className="model-settings-wide-field">API Key<Input.Password aria-label="ASR API Key" autoComplete="new-password" value={draft.apiKey} placeholder={draft.hasApiKey ? "已保存，留空保留原密钥" : "填写服务密钥"} onChange={(event) => change({ apiKey: event.target.value })} /></label>
            </fieldset>}
            <p className="model-settings-hint">在线接口需返回带句段时间戳的 verbose_json。自动模式优先使用本地模型；指定在线后直接使用该服务，失败会提示，不自动重复付费请求。</p>
            <div className="asr-save-actions"><Button disabled={!dirty || save.isPending} onClick={() => { setDraft(status.data!.settings); setDirty(false); }}>放弃修改</Button><Button type="primary" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate(draft)}>保存 ASR 配置</Button></div>
        </>}
    </section>;
}

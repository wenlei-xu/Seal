import { Input, InputNumber, Select } from "antd";
import { audioSpeechProfile, normalizeAudioVoiceValue, normalizeAudioFormatValue, normalizeAudioSpeedValue } from "@/lib/audio-generation";
import { modelOptionName, resolveModelChannel, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";

export function VoiceSettingsPane() {
    const config = useEffectiveConfig();
    const update = useConfigStore((state) => state.updateConfig);
    const profile = audioSpeechProfile(config.audioModel);
    const channel = resolveModelChannel(config, config.audioModel);
    const selected = channel.modelProfiles?.find((item) => item.model === modelOptionName(config.audioModel));
    const native = selected?.protocol === "doubao-tts" || selected?.protocol === "xfyun-tts";
    return <section className="voice-settings-pane" aria-label="默认配音参数">
        <p className="model-settings-hint">文字转语音用于配音；音视频转文字请前往 ASR。参数会用于后续音频生成。</p>
        <div className="model-settings-field-grid">
            {native ? <label>默认音色<Input aria-label="默认音色" value={String(selected.defaultOptions?.voice || "")} readOnly placeholder="在渠道管理中配置音色 ID" /></label> : profile.showVoice && <label>默认音色<Select aria-label="默认音色" value={normalizeAudioVoiceValue(config.audioVoice, config.audioModel)} options={profile.voices} onChange={(value) => update("audioVoice", value)} /></label>}
            <label>音频格式<Select aria-label="音频格式" value={native ? "mp3" : normalizeAudioFormatValue(config.audioFormat, config.audioModel)} disabled={native} options={native ? [{value:"mp3",label:"MP3"}] : profile.formats} onChange={(value) => update("audioFormat", value)} /></label>
            {profile.showSpeed && <label>语速<InputNumber aria-label="语速" min={native ? 0.5 : profile.speedMin} max={native ? 2 : profile.speedMax} step={0.05} value={native ? Math.max(0.5,Math.min(2,Number(config.audioSpeed)||1)) : Number(normalizeAudioSpeedValue(config.audioSpeed, config.audioModel))} onChange={(value) => { if (value !== null) update("audioSpeed", String(value)); }} /></label>}
        </div>
        {!native && profile.showInstructions && <label className="model-settings-wide-field">配音要求<Input.TextArea aria-label="配音要求" rows={2} placeholder="例如：语气自然，适当停顿" value={config.audioInstructions} onChange={(event) => update("audioInstructions", event.target.value)} /></label>}
    </section>;
}

import { assertUserScope, type CapturedUserScope } from '@/lib/user-scope-guard';
import { uploadImage } from '@/services/image-storage';
import { uploadMediaFile } from '@/services/file-storage';
import { persistWorkspaceAssetLink } from '@/services/workspace-asset-repository';
import { useAssetStore, type NewAsset } from '@/stores/use-asset-store';

const fileTypes: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
    mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
};
export const EDIT_MEDIA_FILE_ACCEPT = Object.keys(fileTypes).map(extension => `.${extension}`).join(',');

/** The original file enters the shared library before the editor receives its asset ID. */
export async function saveEditFileToLibrary(file: File, operationId: string, expected: CapturedUserScope) {
    assertUserScope(expected);
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const mimeType = fileTypes[extension];
    if (!mimeType) throw new Error('支持 PNG、JPG、WebP、GIF、MP4、WebM、MP3、WAV、OGG 和 M4A 文件');
    if (!file.size || file.size > 512 * 1024 * 1024) throw new Error('文件大小须在 1 字节至 512 MB 之间');
    const effectKey = `editing-file:${operationId}`;
    let asset = useAssetStore.getState().assets.find(value => value.metadata?.generationEffectKey === effectKey);
    if (!asset) {
        const mediaFile = file.type === mimeType ? file : new File([file], file.name, { type: mimeType, lastModified: file.lastModified });
        const common = { title: file.name.replace(/\.[^.]+$/, ''), tags: [], category: 'material' as const,
            source: '文件导入', coverUrl: '', metadata: { sourceFileName: file.name } };
        let input: NewAsset;
        if (mimeType.startsWith('image/')) {
            const uploaded = await uploadImage(mediaFile, undefined, expected);
            assertUserScope(expected);
            if (uploaded.pendingRemoteUpload) throw new Error('文件尚未保存到本地资源库，请重试导入');
            input = { ...common, kind: 'image', coverUrl: uploaded.url,
                data: { dataUrl: uploaded.url, storageKey: uploaded.storageKey, width: uploaded.width,
                    height: uploaded.height, bytes: uploaded.bytes, mimeType: uploaded.mimeType } };
        } else {
            const uploaded = await uploadMediaFile(mediaFile, mimeType.startsWith('video/') ? 'video' : 'audio', undefined, expected);
            assertUserScope(expected);
            if (uploaded.pendingRemoteUpload) throw new Error('文件尚未保存到本地资源库，请重试导入');
            if (!uploaded.durationMs || uploaded.durationMs <= 0) throw new Error('无法读取媒体时长，请确认文件可正常播放');
            const data = { url: uploaded.url, storageKey: uploaded.storageKey, durationMs: uploaded.durationMs,
                bytes: uploaded.bytes, mimeType: uploaded.mimeType };
            input = mimeType.startsWith('video/')
                ? { ...common, kind: 'video', data: { ...data, width: uploaded.width || 0,
                    height: uploaded.height || 0, hasAudio: uploaded.hasAudio } }
                : { ...common, kind: 'audio', data };
        }
        const id = await useAssetStore.getState().addGenerationAsset(effectKey, input);
        assertUserScope(expected);
        asset = useAssetStore.getState().assets.find(value => value.id === id);
    }
    if (!asset) throw new Error('素材尚未登记，请重试导入');
    await persistWorkspaceAssetLink({ asset, expectedScope: expected });
    assertUserScope(expected);
    return asset.id;
}

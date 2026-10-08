import { assertUserScope, type CapturedUserScope } from '@/lib/user-scope-guard';
import { captureVideoPoster, detectVideoAudioTrackFromBlob } from '@/lib/video-poster';
import { downloadEditExport, type EditExport } from '@/services/api/edit-projects';
import { uploadResourceFile, resourceFileUrl, resourceStorageKey } from '@/services/api/resources';
import { persistWorkspaceAssetLink } from '@/services/workspace-asset-repository';
import { useAssetStore } from '@/stores/use-asset-store';
import { saveAs } from 'file-saver';

export async function saveEditExportToFile(projectId: string, editId: string, exported: EditExport, expected: CapturedUserScope) {
    assertUserScope(expected);
    if (exported.status !== 'complete' || exported.format !== 'mp4') throw new Error('请先完成 MP4 导出');
    const blob = await downloadEditExport(projectId, editId, exported.exportId, expected);
    assertUserScope(expected);
    saveAs(blob, `剪辑成片_${exported.exportId}.mp4`);
}

export async function saveEditExportToLibrary(projectId: string, editId: string, exported: EditExport, expected: CapturedUserScope) {
    assertUserScope(expected);
    if (exported.status !== 'complete' || exported.format !== 'mp4') throw new Error('请先完成 MP4 导出');
    const effectKey = `editing-export:${editId}:${exported.exportId}`;
    const existing = useAssetStore.getState().assets.find(asset => asset.metadata?.generationEffectKey === effectKey);
    if (existing) {
        await persistWorkspaceAssetLink({ asset: existing, expectedScope: expected });
        assertUserScope(expected);
        return existing.id;
    }
    const blob = await downloadEditExport(projectId, editId, exported.exportId, expected);
    assertUserScope(expected);
    const localUrl = URL.createObjectURL(blob);
    let media;
    try { media = await captureVideoPoster(localUrl); }
    finally { URL.revokeObjectURL(localUrl); }
    assertUserScope(expected);
    const hasAudio = await detectVideoAudioTrackFromBlob(blob);
    assertUserScope(expected);
    const resource = await uploadResourceFile(new Blob([blob], { type: 'video/mp4' }), 'video', {
        width: media.width, height: media.height, durationMs: media.durationMs,
        fileName: `${exported.exportId}.mp4`, idempotencyKey: effectKey, expectedScope: expected,
    });
    assertUserScope(expected);
    const id = await useAssetStore.getState().addGenerationAsset(effectKey, {
        kind: 'video', title: `剪辑成片 · 版本 ${exported.inputRevision}`, coverUrl: '', tags: [], category: 'material', source: '剪辑导出',
        data: { url: resourceFileUrl(resource.id), storageKey: resourceStorageKey(resource.id),
            width: resource.width || media.width, height: resource.height || media.height,
            durationMs: resource.durationMs || media.durationMs, hasAudio, bytes: resource.size, mimeType: 'video/mp4' },
        metadata: { projectId, editId, exportId: exported.exportId, inputRevision: exported.inputRevision },
    });
    assertUserScope(expected);
    const asset = useAssetStore.getState().assets.find(value => value.id === id);
    if (!asset) throw new Error('成片素材还未登记，请重试保存');
    await persistWorkspaceAssetLink({ asset, expectedScope: expected });
    assertUserScope(expected);
    return id;
}

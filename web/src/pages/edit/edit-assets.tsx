import { useEffect, useRef, useState } from 'react';
import { Button } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Film, RefreshCw, Upload } from 'lucide-react';
import { AssetLibraryPickerModal } from '@/components/assets/asset-library-picker-modal';
import { AppModal } from '@/components/ui/product/app-modal';
import { captureUserScope, assertUserScope } from '@/lib/user-scope-guard';
import { ApiError } from '@/services/api/request';
import { getEditContext, importEditAsset, listEditExports } from '@/services/api/edit-projects';
import { saveEditExportToFile, saveEditExportToLibrary } from '@/services/edit-export-assets';
import { useAssetStore } from '@/stores/use-asset-store';
import { EDIT_MEDIA_FILE_ACCEPT, saveEditFileToLibrary } from '@/services/edit-import-files';

export function EditAssets({ projectId, editId, onRevision, command, hideButtons = false }: { projectId: string; editId: string; onRevision: (revision: number) => void;
    command?: { action: string; id: string }; hideButtons?: boolean }) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const [exportsOpen, setExportsOpen] = useState(false);
    const [scope] = useState(() => captureUserScope());
    const [saving, setSaving] = useState<string | null>(null);
    const [downloading, setDownloading] = useState<string | null>(null);
    const [saved, setSaved] = useState<Set<string>>(new Set());
    const [error, setError] = useState('');
    const [fileImportOpen, setFileImportOpen] = useState(false);
    const [fileImportBusy, setFileImportBusy] = useState(false);
    const [fileImportMessage, setFileImportMessage] = useState('');
    const [fileImportError, setFileImportError] = useState('');
    const [files, setFiles] = useState<{ file: File; operationId: string; done: boolean; expectedRevision?: number }[]>([]);
    const fileInput = useRef<HTMLInputElement>(null);
    const operations = useRef(new Map<string, { operationId: string; expectedRevision: number }>());
    const assets = useAssetStore(state => state.assets);
    const queryClient = useQueryClient();
    useEffect(() => {
        if (command?.action === 'import-file') fileInput.current?.click();
        if (command?.action === 'asset-library') setPickerOpen(true);
        if (command?.action === 'export-results') { setError(''); setExportsOpen(true); }
    }, [command]);
    const exports = useQuery({ queryKey: ['edit-exports', scope.userScope, scope.epoch, projectId, editId],
        queryFn: ({ signal }) => listEditExports(projectId, editId, scope, signal), enabled: exportsOpen,
        refetchInterval: exportsOpen ? 3000 : false });
    return <>
        <input ref={fileInput} type="file" accept={EDIT_MEDIA_FILE_ACCEPT} multiple hidden onChange={event => {
            const selected = Array.from(event.currentTarget.files || []);
            event.currentTarget.value = '';
            if (!selected.length) return;
            setFiles(selected.map(file => ({ file, operationId: crypto.randomUUID(), done: false })));
            setFileImportError(''); setFileImportMessage(''); setFileImportOpen(true);
        }} />
        {!hideButtons ? <><Button type="text" icon={<Upload size={16} />} disabled={fileImportBusy} onClick={() => fileInput.current?.click()}>从文件导入</Button>
        <Button type="text" icon={<FolderOpen size={16} />} onClick={() => setPickerOpen(true)}>资产库</Button>
        <Button type="text" icon={<Film size={16} />} onClick={() => { setError(''); setExportsOpen(true); }}>导出结果</Button></> : null}
        <AssetLibraryPickerModal remoteLibrary open={pickerOpen} items={assets.filter(asset => ['image', 'video', 'audio'].includes(asset.kind)).map(asset => ({
            id: asset.id, title: asset.title, category: asset.category || 'other', asset,
            kindLabel: asset.kind === 'image' ? '图片' : asset.kind === 'video' ? '视频' : '音频',
            archived: asset.status === 'archived',
        }))} categoryLabels={{ all: '全部素材', material: '素材', other: '其他' }} multiple={false}
            title="从资产库加入剪辑" eyebrow="剪辑素材" confirmLabel={() => '加入轨道'}
            footerNote="素材会追加到工程末尾，之后可以在轨道中移动。" onClose={() => setPickerOpen(false)}
            onConfirm={async (ids, expectedScope) => {
                const assetId = ids[0];
                if (!assetId) throw new Error('请选择一个素材');
                assertUserScope(expectedScope);
                let operation = operations.current.get(assetId);
                if (!operation) {
                    const context = await getEditContext(projectId, editId, expectedScope);
                    assertUserScope(expectedScope);
                    operation = { operationId: crypto.randomUUID(), expectedRevision: context.revision };
                    operations.current.set(assetId, operation);
                }
                try {
                    const result = await importEditAsset(projectId, editId, { assetId, ...operation }, expectedScope);
                    assertUserScope(expectedScope);
                    operations.current.delete(assetId); onRevision(result.revision); setPickerOpen(false);
                } catch (reason) {
                    if (reason instanceof ApiError && reason.status && reason.status >= 400 && reason.status < 500) operations.current.delete(assetId);
                    throw reason;
                }
            }} />
        <AppModal title="从文件导入" open={fileImportOpen} onCancel={() => { if (!fileImportBusy) setFileImportOpen(false); }} footer={null}>
            <p className="text-sm text-[var(--muted-foreground)]">文件会先保存到资产库，再依次追加到剪辑轨道。</p>
            <ul className="my-3 space-y-1 text-sm">{files.map(item => <li key={item.operationId} className="break-all">{item.file.name}{item.done ? ' · 已加入轨道' : ''}</li>)}</ul>
            {fileImportMessage ? <p role="status">{fileImportMessage}</p> : null}
            {fileImportError ? <p role="alert" className="text-sm">{fileImportError}</p> : null}
            <Button type="primary" loading={fileImportBusy} disabled={!files.some(item => !item.done)} onClick={() => {
                setFileImportBusy(true); setFileImportError('');
                void (async () => {
                    for (const item of files) {
                        if (item.done) continue;
                        assertUserScope(scope);
                        setFileImportMessage(`正在导入 ${item.file.name}…`);
                        const assetId = await saveEditFileToLibrary(item.file, item.operationId, scope);
                        if (item.expectedRevision === undefined) {
                            item.expectedRevision = (await getEditContext(projectId, editId, scope)).revision;
                        }
                        try {
                            const result = await importEditAsset(projectId, editId, { assetId,
                                operationId: item.operationId, expectedRevision: item.expectedRevision }, scope);
                            assertUserScope(scope);
                            item.done = true; onRevision(result.revision); setFiles(previous => [...previous]);
                        } catch (reason) {
                            if (reason instanceof ApiError && reason.status && reason.status >= 400 && reason.status < 500) item.expectedRevision = undefined;
                            throw reason;
                        }
                    }
                    setFileImportMessage('已保存到资产库并加入轨道。');
                    void queryClient.invalidateQueries({ queryKey: ['asset-picker'] });
                })().catch(reason => setFileImportError(reason instanceof Error ? reason.message : '导入失败，请重试'))
                    .finally(() => setFileImportBusy(false));
            }}>{fileImportError ? '重试导入' : '保存并加入轨道'}</Button>
        </AppModal>
        <AppModal title="导出结果" open={exportsOpen} onCancel={() => { if (!saving) setExportsOpen(false); }} footer={null}>
            <p className="text-sm text-[var(--muted-foreground)]">在编辑器中完成导出后，可将成片保存到统一资产库。</p>
            <Button type="text" icon={<RefreshCw size={16} />} onClick={() => void exports.refetch()}>刷新</Button>
            {exports.isPending ? <p>正在读取导出结果…</p> : null}
            {exports.isError ? <p role="alert">{exports.error.message}</p> : null}
            {exports.isSuccess && !exports.data.length ? <p>还没有导出结果。</p> : null}
            <div className="flex flex-col gap-3">
                {exports.data?.map(exported => <div key={exported.exportId} className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-3">
                    <span>版本 {exported.inputRevision} · {new Date(exported.createdAt).toLocaleString()}<br />
                        <small>{exported.status === 'complete' ? '导出完成' : exported.status === 'failed' ? '导出失败' : exported.status === 'cancelled' ? '已取消' : '正在导出'}</small></span>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button aria-label="下载视频" loading={downloading === exported.exportId}
                        disabled={Boolean(saving) || Boolean(downloading) || exported.status !== 'complete' || exported.format !== 'mp4'}
                        onClick={() => {
                            setDownloading(exported.exportId); setError('');
                            void saveEditExportToFile(projectId, editId, exported, scope)
                                .catch(reason => setError(reason instanceof Error ? reason.message : '下载失败'))
                                .finally(() => setDownloading(null));
                        }}>下载视频</Button>
                    <Button aria-label={saved.has(exported.exportId) ? '已保存' : saving === exported.exportId ? '正在保存到资产库' : '保存到资产库'}
                        disabled={Boolean(saving) || Boolean(downloading) || saved.has(exported.exportId) || exported.status !== 'complete' || exported.format !== 'mp4'}
                        loading={saving === exported.exportId} onClick={() => {
                            setSaving(exported.exportId); setError('');
                            void saveEditExportToLibrary(projectId, editId, exported, scope).then(() => {
                                assertUserScope(scope); setSaved(previous => new Set(previous).add(exported.exportId));
                                void queryClient.invalidateQueries({ queryKey: ['asset-picker'] });
                            }).catch(reason => setError(reason instanceof Error ? reason.message : '保存失败'))
                                .finally(() => setSaving(null));
                        }}>{saved.has(exported.exportId) ? '已保存' : '保存到资产库'}</Button>
                    </div>
                </div>)}
            </div>
            {error ? <p role="alert">{error}</p> : null}
        </AppModal>
    </>;
}

import { http } from './request';
import type { CapturedUserScope } from '@/lib/user-scope-guard';
export type HubSkill = { id: string; name: string; displayName: string; description: string; builtin: boolean; enabled: boolean; version: string; contentHash: string; fileCount: number; updatedAt: string; problem?: string; sourceType?: string; sourceUrl?: string; sourceCommit?: string };
export type HubPreview = { name: string; description: string; version: string; contentHash: string; fileCount: number; entry: string; needsMetadata: boolean; existingId?: string; builtinConflict?: boolean };
export type HubFile = { path: string; kind: string; mimeType: string; size: number; sha256: string };
export type HubFileContent = { file: HubFile; content: string; binary: boolean };
export type HubImport = { file: File; name: string; description: string; contentHash?: string; targetId?: string; enabled?: boolean };
function upload(input: HubImport) {
    const form = new FormData();
    form.append('file', input.file); form.append('name', input.name); form.append('description', input.description);
    if (input.contentHash) form.append('contentHash', input.contentHash);
    if (input.targetId) form.append('targetId', input.targetId);
    form.append('enabled', String(input.enabled ?? true)); return form;
}
export function listHubSkills(scope: CapturedUserScope, signal?: AbortSignal) { return http.get<{ skills: HubSkill[] }>('/skill-hub', { expectedScope: scope, signal, timeout: 30_000 }); }
export function inspectHubSkill(input: HubImport, scope: CapturedUserScope) { return http.post<HubPreview>('/skill-hub/inspect', upload(input), { expectedScope: scope, timeout: 30_000 }); }
export function installHubSkill(input: HubImport, scope: CapturedUserScope) { return http.post<{ id: string }>('/skill-hub/install', upload(input), { expectedScope: scope, timeout: 30_000 }); }
export function enableHubSkill(id: string, enabled: boolean, scope: CapturedUserScope) { return http.patch(`/skill-hub/${encodeURIComponent(id)}/enabled`, { enabled }, { expectedScope: scope }); }
export function uninstallHubSkill(id: string, scope: CapturedUserScope) { return http.delete(`/skill-hub/${encodeURIComponent(id)}`, { expectedScope: scope }); }
export function listHubFiles(id: string, scope: CapturedUserScope, signal?: AbortSignal) { return http.get<{ files: HubFile[] }>(`/skill-hub/${encodeURIComponent(id)}/files`, { expectedScope: scope, signal }); }
export function readHubFile(id: string, path: string, scope: CapturedUserScope, signal?: AbortSignal) { return http.get<HubFileContent>(`/skill-hub/${encodeURIComponent(id)}/file`, { params: { path }, expectedScope: scope, signal }); }

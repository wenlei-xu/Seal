import { motion, useReducedMotion } from "motion/react";
import { ScrollText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button, Checkbox } from 'antd';
import { useDesktopUpdate } from '@/hooks/use-desktop-update';
import { useDesktopUpdatePreferences } from '@/stores/use-desktop-update-preferences';

import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { aceternityMotion } from "@/lib/aceternity-motion";

export function AppChangelogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const reducedMotion = useReducedMotion();
    const updater = useDesktopUpdate();
    const preferences = useDesktopUpdatePreferences();
    const busy = updater.actionBusy || updater.persistBusy || ['checking', 'downloading', 'installing'].includes(updater.state.status);
    const version = `v${__APP_VERSION__.replace(/^v/, "")}`;

    return (
        <AppModal
            rootClassName="app-spatial-modal app-changelog-modal"
            title={
                <div className="app-changelog-heading">
                    <span className="app-changelog-heading-icon">
                        <ScrollText className="size-4" />
                    </span>
                    <div className="app-changelog-heading-copy">
                        <div className="app-changelog-heading-title">更新日志</div>
                        <div className="app-changelog-heading-description">按版本查看产品能力、交互与稳定性变化</div>
                    </div>
                    <span className="app-changelog-current-version">当前版本 {version}</span>
                </div>
            }
            open={open}
            width={820}
            footer={updater.runtime === 'desktop' ? <div className="flex flex-wrap items-center gap-3 text-left">
                <Checkbox checked={preferences.autoDownload} onChange={event => preferences.setAutoDownload(event.target.checked)}>自动下载更新</Checkbox>
                <span className="min-w-0 flex-1 text-xs text-[var(--muted-foreground)]" role="status">
                    {updater.state.error || (updater.state.status === 'ready' ? `新版 ${updater.state.latestVersion} 已下载，重启后安装` : updater.state.status === 'downloading' ? '正在后台下载，可继续创作' : updater.state.status === 'disabled' ? '当前构建未配置更新' : updater.state.releaseNotes === '尚未发布公开更新' ? '尚未发布公开更新' : updater.state.latestVersion ? `最新版本 ${updater.state.latestVersion}` : '')}
                </span>
                <Button disabled={busy || updater.state.status === 'disabled' || updater.state.status === 'ready'} onClick={() => void updater.check()}>检查更新</Button>
                {updater.state.status === 'available' ? <Button onClick={() => void updater.download()}>下载更新</Button> : null}
                {updater.state.status === 'ready' ? <Button type="primary" loading={updater.persistBusy} onClick={() => void updater.install()}>保存并重启更新</Button> : null}
            </div> : null}
            centered
            onCancel={onClose}
            modalRender={(node) => (
                <motion.div initial={reducedMotion ? false : { opacity: 0, y: 14, scale: 0.975 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: aceternityMotion.duration.panel, ease: aceternityMotion.easing.enter }}>
                    {node}
                </motion.div>
            )}
        >
            <div className="app-changelog-scroll thin-scrollbar">
                <ReactMarkdown
                    components={{
                        h1: () => null,
                        h2: ({ children }) => {
                            const label = String(children);
                            const latest = label === "Unreleased";

                            return (
                                <h3 className={`app-changelog-section-heading${latest ? " is-latest" : ""}`}>
                                    <span className="app-changelog-section-marker" aria-hidden="true" />
                                    <span>{latest ? "开发中" : label}</span>
                                    {latest ? <span className="app-changelog-latest-badge">最新</span> : null}
                                </h3>
                            );
                        },
                        ul: ({ children }) => <ul className="app-changelog-list">{children}</ul>,
                        li: ({ children }) => <li>{children}</li>,
                        p: ({ children }) => <p className="app-changelog-paragraph">{children}</p>,
                        code: ({ children }) => <code className="app-changelog-code">{children}</code>,
                    }}
                >
                    {__APP_CHANGELOG__}
                </ReactMarkdown>
            </div>
        </AppModal>
    );
}

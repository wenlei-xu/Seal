import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useDesktopUpdatePreferences = create<{ autoDownload: boolean; setAutoDownload: (value: boolean) => void }>()(
    persist((set) => ({ autoDownload: true, setAutoDownload: (autoDownload) => set({ autoDownload }) }),
        { name: 'seal:desktop-update-preferences', partialize: (state) => ({ autoDownload: state.autoDownload }) }),
);

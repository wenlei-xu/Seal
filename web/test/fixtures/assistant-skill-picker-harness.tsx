import { createRoot } from 'react-dom/client';
import { useEffect } from 'react';
import { App, ConfigProvider, theme } from 'antd';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CanvasAssistantSidebar } from '@/pages/canvas/canvas-assistant-sidebar';
import { useCanvasAssistant } from '@/pages/canvas/use-canvas-assistant';
import { hydrateModelConfig } from '@/services/model-config-repository';
import { useConfigStore } from '@/stores/use-config-store';

const hydrated=await hydrateModelConfig();
useConfigStore.getState().replaceConfig(hydrated.config);
const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
function Harness() {
    const assistant=useCanvasAssistant({canvasId:'skill-canvas',onCanvasChanged:()=>{}});
    useEffect(()=>assistant.setOpen(true),[]);
    return <MemoryRouter><QueryClientProvider client={queryClient}><ConfigProvider theme={{algorithm:theme.darkAlgorithm}}><App>
        <div style={{height:800,width:380,margin:'20px auto',display:'flex',background:'var(--background)'}}>
            <CanvasAssistantSidebar assistant={assistant} canvasTitle="技能调用验收" dockable readOnly={false} selectedNodeIds={[]} references={[]} onLocateNodes={()=>{}} onRunProposal={()=>{}} onOpenModelSettings={()=>{}} />
        </div>
    </App></ConfigProvider></QueryClientProvider></MemoryRouter>;
}
createRoot(document.getElementById('root')!).render(<Harness />);

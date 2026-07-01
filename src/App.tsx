import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from './store';
import SetupScreen from './components/SetupScreen';
import Titlebar from './components/Titlebar';
import Sidebar from './components/Sidebar';
import GeneratePanel from './components/GeneratePanel';
import ModelsPanel from './components/ModelsPanel';
import SettingsPanel from './components/SettingsPanel';
import LicensePanel from './components/LicensePanel';

export default function App() {
  const store = useAppStore();

  // Auto-start sidecar when entering main view
  useEffect(() => {
    if (store.view === 'main' && !store.sidecarStatus.running) {
      store.startSidecar();
    }
  }, [store.view]);

  const activeJobCount = store.jobs.filter(
    j => j.status !== 'done' && j.status !== 'error' && j.status !== 'idle'
  ).length;

  // Setup screen
  if (store.view === 'setup') {
    return (
      <div className="h-screen w-screen overflow-hidden bg-bg-primary">
        <SetupScreen
          step={store.setupStep}
          gpu={store.gpu}
          onDetectGPU={store.detectGPU}
          onComplete={() => store.setView('main')}
        />
      </div>
    );
  }

  // Main app layout
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg-primary">
      {/* Titlebar */}
      <Titlebar sidecar={store.sidecarStatus} />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          activeView={store.view}
          onViewChange={store.setView}
          gpu={store.gpu}
          activeJobCount={activeJobCount}
        />

        {/* Content Area */}
        <AnimatePresence mode="wait">
          <motion.div
            key={store.view}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
            className="flex flex-1 overflow-hidden"
          >
            {store.view === 'main' && (
              <GeneratePanel
                currentPrompt={store.currentPrompt}
                negativePrompt={store.negativePrompt}
                selectedModel={store.selectedModel}
                models={store.models}
                jobs={store.jobs}
                galleryItems={store.galleryItems}
                onPromptChange={store.setCurrentPrompt}
                onNegativePromptChange={store.setNegativePrompt}
                onModelChange={store.setSelectedModel}
                onGenerate={store.startGeneration}
              />
            )}
            {store.view === 'models' && (
              <ModelsPanel
                models={store.models}
                gpu={store.gpu}
                onDownload={store.downloadModel}
                onCancel={store.cancelDownload}
                onDelete={store.deleteModel}
              />
            )}
            {store.view === 'settings' && (
              <SettingsPanel sidecar={store.sidecarStatus} />
            )}
            {store.view === 'license' && (
              <LicensePanel
                license={store.license}
                onValidate={store.validateLicense}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

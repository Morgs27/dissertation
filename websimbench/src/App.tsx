import { useState } from 'react';
import { Navbar } from './components/Navbar';
import { ReportsView } from './pages/ReportsView';
import { OptionsView } from './pages/OptionsView';

import { useBenchmarkHistory } from './hooks/useBenchmarkHistory';
import { useSimulationOptions, UpdateOptionFn } from './hooks/useSimulationOptions';

import { Toaster } from "@/components/ui/sonner";
import { Home } from './pages/Home';

function App() {
  const [currentPage, setCurrentPage] = useState('home');

  const { options, updateOption, resetOptions } = useSimulationOptions();

  const { reports, updateReportName, clearReports } = useBenchmarkHistory();

  // TODO: Implement theme
  // const { theme, currentTheme, setCurrentTheme } = useTheme();

  const bg = 'bg-[#1f363d]'; // jetBlack

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'reports':
        return (
          <ReportsView
            reports={reports}
            onClear={clearReports}
            onRename={updateReportName}
          />
        );
      case 'options':
        return (
          <OptionsView
            options={options}
            updateOption={updateOption as UpdateOptionFn}
            resetOptions={resetOptions}
          />
        );
      case 'home':
      default:
        return (
          <Home />
        );
    }
  };

  return (
    <div className={`flex flex-col h-screen w-screen overflow-hidden ${bg} text-teaGreen selection:bg-tropicalTeal/30`}>
      <Navbar currentPage={currentPage} setCurrentPage={setCurrentPage} />

      <main className="flex-1 overflow-hidden relative">
        {renderCurrentPage()}
      </main>

      <Toaster />
    </div>
  );
}

export default App;
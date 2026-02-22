import { useCallback, useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { ReportsView } from './pages/ReportsView';
import { OptionsView } from './pages/OptionsView';
import { DocsView } from './pages/DocsView';

import { useBenchmarkHistory } from './hooks/useBenchmarkHistory';
import { useSimulationOptions, UpdateOptionFn } from './hooks/useSimulationOptions';

import { Toaster } from "@/components/ui/sonner";
import { Home } from './pages/Home';
import { AppRoute, createHashRoute, getCurrentPageId, parseHashRoute } from './lib/routes';
import { DOCS_DEFAULT_PAGE, DOCS_LATEST_VERSION } from './config/version';

const HOME_ROUTE: AppRoute = { page: 'home' };

function App() {
  const [route, setRoute] = useState<AppRoute>(() => {
    if (typeof window === 'undefined') {
      return HOME_ROUTE;
    }

    return parseHashRoute(window.location.hash);
  });

  const { options, updateOption, resetOptions } = useSimulationOptions();

  const {
    reports,
    isLoading: isReportsLoading,
    error: reportsError,
    addReport,
    updateReportName,
    clearReports,
  } = useBenchmarkHistory();

  // TODO: Implement theme
  // const { theme, currentTheme, setCurrentTheme } = useTheme();

  const bg = 'bg-[#1f363d]'; // jetBlack

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const syncRouteFromHash = () => {
      setRoute(parseHashRoute(window.location.hash));
    };

    if (!window.location.hash) {
      window.location.hash = createHashRoute(HOME_ROUTE);
    } else {
      syncRouteFromHash();
    }

    window.addEventListener('hashchange', syncRouteFromHash);

    return () => {
      window.removeEventListener('hashchange', syncRouteFromHash);
    };
  }, []);

  const navigate = useCallback((nextRoute: AppRoute) => {
    if (typeof window === 'undefined') {
      setRoute(nextRoute);
      return;
    }

    const nextHash = createHashRoute(nextRoute);
    if (window.location.hash === nextHash) {
      setRoute(nextRoute);
      return;
    }

    window.location.hash = nextHash;
  }, []);

  const handleNavigatePage = useCallback((nextPage: 'home' | 'reports' | 'options' | 'docs') => {
    if (nextPage === 'docs') {
      navigate({
        page: 'docs',
        version: DOCS_LATEST_VERSION,
        docsPage: DOCS_DEFAULT_PAGE,
      });
      return;
    }

    navigate({ page: nextPage });
  }, [navigate]);

  const renderCurrentPage = () => {
    switch (route.page) {
      case 'reports':
        return (
          <ReportsView
            reports={reports}
            isLoading={isReportsLoading}
            loadError={reportsError}
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
      case 'docs':
        return (
          <DocsView
            requestedVersion={route.version}
            requestedPage={route.docsPage}
            onNavigate={({ version, page }) => {
              navigate({
                page: 'docs',
                version,
                docsPage: page,
              });
            }}
          />
        );
      case 'home':
      default:
        return (
          <Home options={options} onBenchmarkComplete={addReport} />
        );
    }
  };

  return (
    <div className={`flex flex-col h-screen w-screen overflow-hidden ${bg} text-teaGreen selection:bg-tropicalTeal/30`}>
      <Navbar
        currentPage={getCurrentPageId(route)}
        onNavigatePage={handleNavigatePage}
      />

      <main className="flex-1 overflow-hidden relative">
        {renderCurrentPage()}
      </main>

      <Toaster />
    </div>
  );
}

export default App;

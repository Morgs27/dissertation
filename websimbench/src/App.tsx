import { useCallback, useEffect, useState } from "react";
import { Navbar } from "./components/Navbar";
import { OnboardingModal } from "./components/OnboardingModal";
import { DocsView } from "./pages/DocsView";

import {
  useSimulationOptions,
  UpdateOptionFn,
} from "./hooks/useSimulationOptions";

import { Toaster } from "@/components/ui/sonner";
import { Home } from "./pages/Home";
import {
  AppRoute,
  createHashRoute,
  getCurrentPageId,
  parseHashRoute,
} from "./lib/routes";
import { DOCS_DEFAULT_PAGE, DOCS_LATEST_VERSION } from "./config/version";

const HOME_ROUTE: AppRoute = { page: "home" };
const ONBOARDING_STORAGE_KEY = "websimbench_onboarding_seen_v1";

function App() {
  const [route, setRoute] = useState<AppRoute>(() => {
    if (typeof window === "undefined") {
      return HOME_ROUTE;
    }

    return parseHashRoute(window.location.hash);
  });
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) !== "1";
  });

  const { options, updateOption, resetOptions } = useSimulationOptions();

  // TODO: Implement theme
  // const { theme, currentTheme, setCurrentTheme } = useTheme();

  const bg = "bg-[#1f363d]"; // jetBlack

  useEffect(() => {
    if (typeof window === "undefined") {
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

    window.addEventListener("hashchange", syncRouteFromHash);

    return () => {
      window.removeEventListener("hashchange", syncRouteFromHash);
    };
  }, []);

  const navigate = useCallback((nextRoute: AppRoute) => {
    if (typeof window === "undefined") {
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

  const handleNavigatePage = useCallback(
    (nextPage: "home" | "docs") => {
      if (nextPage === "docs") {
        navigate({
          page: "docs",
          version: DOCS_LATEST_VERSION,
          docsPage: DOCS_DEFAULT_PAGE,
        });
        return;
      }

      navigate({ page: nextPage });
    },
    [navigate],
  );

  const handleOnboardingOpenChange = useCallback((open: boolean) => {
    setIsOnboardingOpen(open);
    if (!open && typeof window !== "undefined") {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    }
  }, []);

  const dismissOnboarding = useCallback(() => {
    handleOnboardingOpenChange(false);
  }, [handleOnboardingOpenChange]);

  const openDocsFromOnboarding = useCallback(() => {
    dismissOnboarding();
    navigate({
      page: "docs",
      version: DOCS_LATEST_VERSION,
      docsPage: DOCS_DEFAULT_PAGE,
    });
  }, [dismissOnboarding, navigate]);

  const renderCurrentPage = () => {
    switch (route.page) {
      case "docs":
        return (
          <DocsView
            requestedVersion={route.version}
            requestedPage={route.docsPage}
            onNavigate={({ version, page }) => {
              navigate({
                page: "docs",
                version,
                docsPage: page,
              });
            }}
          />
        );
      case "home":
      default:
        return (
          <Home
            options={options}
            updateOption={updateOption as UpdateOptionFn}
            resetOptions={resetOptions}
          />
        );
    }
  };

  return (
    <div
      className={`flex flex-col h-screen w-screen overflow-hidden ${bg} text-teaGreen selection:bg-tropicalTeal/30`}
    >
      <Navbar
        currentPage={getCurrentPageId(route)}
        onNavigatePage={handleNavigatePage}
      />

      <main className="flex-1 overflow-hidden relative">
        {renderCurrentPage()}
      </main>

      <OnboardingModal
        open={isOnboardingOpen}
        onOpenChange={handleOnboardingOpenChange}
        onContinue={dismissOnboarding}
        onOpenDocs={openDocsFromOnboarding}
      />

      <Toaster />
    </div>
  );
}

export default App;

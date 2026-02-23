import { DOCS_DEFAULT_PAGE, DOCS_LATEST_VERSION } from "@/config/version";

export type PageId = "home" | "reports" | "docs";

export type AppRoute =
  | { page: "home" }
  | { page: "reports" }
  | { page: "docs"; version: string; docsPage: string };

const DEFAULT_ROUTE: AppRoute = { page: "home" };

const isTopLevelPage = (value: string): value is PageId => {
  return value === "home" || value === "reports" || value === "docs";
};

export const parseHashRoute = (hashValue: string): AppRoute => {
  const normalized = hashValue.startsWith("#") ? hashValue.slice(1) : hashValue;
  const cleanPath = normalized.startsWith("/")
    ? normalized.slice(1)
    : normalized;

  if (!cleanPath) {
    return DEFAULT_ROUTE;
  }

  const [rawPage, rawVersion, rawDocsPage] = cleanPath.split("/");
  const page = rawPage?.trim().toLowerCase();

  if (!page || !isTopLevelPage(page)) {
    return DEFAULT_ROUTE;
  }

  if (page !== "docs") {
    return { page };
  }

  const version = rawVersion?.trim() || DOCS_LATEST_VERSION;
  const docsPage = rawDocsPage?.trim() || DOCS_DEFAULT_PAGE;

  return {
    page: "docs",
    version,
    docsPage,
  };
};

export const createHashRoute = (route: AppRoute): string => {
  if (route.page === "docs") {
    return `#/docs/${route.version}/${route.docsPage}`;
  }

  return `#/${route.page}`;
};

export const getCurrentPageId = (route: AppRoute): PageId => route.page;

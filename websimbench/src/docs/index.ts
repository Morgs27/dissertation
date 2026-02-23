import {
  DOCS_CURRENT_VERSION,
  DOCS_LATEST_VERSION,
  type DocsVersionOption,
} from "@/config/version";
import { docsV010 } from "./v0.1.0";
import type { DocsPage, DocsVersion } from "./types";

const versionMap: Record<string, DocsVersion> = {
  [docsV010.id]: docsV010,
};

const aliasMap: Record<DocsVersionOption, DocsVersion["id"]> = {
  [DOCS_LATEST_VERSION]: DOCS_CURRENT_VERSION,
  [DOCS_CURRENT_VERSION]: DOCS_CURRENT_VERSION,
};

export const getDocsVersion = (
  requestedVersion: string | undefined,
): DocsVersion => {
  const key =
    requestedVersion && requestedVersion in aliasMap
      ? aliasMap[requestedVersion as DocsVersionOption]
      : requestedVersion;

  if (key && key in versionMap) {
    return versionMap[key];
  }

  return versionMap[DOCS_CURRENT_VERSION];
};

export const resolveDocsVersionLabel = (
  requestedVersion: string | undefined,
): DocsVersionOption => {
  if (!requestedVersion) {
    return DOCS_LATEST_VERSION;
  }

  if (requestedVersion in aliasMap) {
    return requestedVersion as DocsVersionOption;
  }

  return DOCS_LATEST_VERSION;
};

export const findDocsPage = (
  docsVersion: DocsVersion,
  pageId: string | undefined,
): DocsPage => {
  if (pageId) {
    const found = docsVersion.pages.find((page) => page.id === pageId);
    if (found) {
      return found;
    }
  }

  return docsVersion.pages[0];
};

export const getAvailableDocsVersions = (): DocsVersionOption[] => [
  DOCS_LATEST_VERSION,
  DOCS_CURRENT_VERSION,
];

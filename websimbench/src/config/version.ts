export const CURRENT_VERSION = "0.1.0";

export const APP_VERSION_LABEL = `v${CURRENT_VERSION}`;

export const PACKAGE_NAME = "@websimbench/agentyx";

export const DOCS_LATEST_VERSION = "latest" as const;
export const DOCS_CURRENT_VERSION = `v${CURRENT_VERSION}` as const;

export const DOCS_VERSION_OPTIONS = [
  DOCS_LATEST_VERSION,
  DOCS_CURRENT_VERSION,
] as const;

export type DocsVersionOption = (typeof DOCS_VERSION_OPTIONS)[number];

export const DOCS_DEFAULT_PAGE = "overview";

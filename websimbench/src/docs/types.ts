export type DocsCodeLanguage = "bash" | "ts" | "js" | "html" | "dsl" | "json";

export type DocsCodeSnippet = {
  title: string;
  language: DocsCodeLanguage;
  code: string;
};

export type DocsCalloutVariant = "tip" | "note" | "warning" | "info";

export type DocsLinkCard = {
  page: string;
  title: string;
  description: string;
  icon: string;
};

export type DocsContentBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "ordered-list"; items: string[] }
  | { kind: "code"; snippet: DocsCodeSnippet }
  | {
      kind: "callout";
      variant: DocsCalloutVariant;
      title?: string;
      text: string;
    }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "heading"; text: string }
  | { kind: "link-cards"; cards: DocsLinkCard[] }
  | { kind: "example-runner"; exampleId: string };

export type DocsContentSection = {
  id: string;
  title: string;
  content?: DocsContentBlock[];
  /** @deprecated Use `content` blocks instead. */
  paragraphs?: string[];
  /** @deprecated Use `content` blocks instead. */
  bullets?: string[];
  /** @deprecated Use `content` blocks instead. */
  snippets?: DocsCodeSnippet[];
};

export type DocsPage = {
  id: string;
  title: string;
  description: string;
  sections: DocsContentSection[];
};

export type DocsNavigationSection = {
  id: string;
  title: string;
  pages: Array<Pick<DocsPage, "id" | "title">>;
};

export type RunnableExample = {
  id: string;
  title: string;
  description: string;
  html: string;
  javascript: string;
};

export type DocsVersion = {
  id: `v${string}`;
  packageVersion: string;
  releaseDate: string;
  sections: DocsNavigationSection[];
  pages: DocsPage[];
  runnableExamples: RunnableExample[];
};

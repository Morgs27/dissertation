export type DocsCodeLanguage = 'bash' | 'ts' | 'js' | 'html' | 'dsl' | 'json';

export type DocsCodeSnippet = {
  title: string;
  language: DocsCodeLanguage;
  code: string;
};

export type DocsContentSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
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
  pages: Array<Pick<DocsPage, 'id' | 'title'>>;
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

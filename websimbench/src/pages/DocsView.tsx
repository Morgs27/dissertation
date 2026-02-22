import { useEffect } from 'react';
import { CodeBlock } from '@/components/docs/CodeBlock';
import { ExamplesRunner } from '@/components/docs/ExamplesRunner';
import {
  findDocsPage,
  getAvailableDocsVersions,
  getDocsVersion,
  resolveDocsVersionLabel,
} from '@/docs';
import { DOCS_LATEST_VERSION, PACKAGE_NAME } from '@/config/version';

interface DocsViewProps {
  requestedVersion: string;
  requestedPage: string;
  onNavigate: (next: { version: string; page: string }) => void;
}

export const DocsView = ({ requestedVersion, requestedPage, onNavigate }: DocsViewProps) => {
  const docsVersion = getDocsVersion(requestedVersion);
  const resolvedVersion = resolveDocsVersionLabel(requestedVersion);
  const availableVersions = getAvailableDocsVersions();
  const activePage = findDocsPage(docsVersion, requestedPage);

  useEffect(() => {
    if (requestedVersion !== resolvedVersion || requestedPage !== activePage.id) {
      onNavigate({
        version: resolvedVersion,
        page: activePage.id,
      });
    }
  }, [activePage.id, onNavigate, requestedPage, requestedVersion, resolvedVersion]);

  return (
    <div className="h-full w-full overflow-hidden bg-[#10262d]">
      <div className="h-full grid grid-cols-1 lg:grid-cols-[280px_1fr]">
        <aside className="border-r border-white/10 bg-black/25 overflow-y-auto">
          <div className="p-4 border-b border-white/10">
            <h2 className="text-sm font-bold uppercase tracking-wide text-white">Documentation</h2>
            <p className="text-xs text-gray-400 mt-1">{PACKAGE_NAME}</p>
          </div>

          <div className="p-4 space-y-5">
            {docsVersion.sections.map((section) => (
              <div key={section.id} className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  {section.title}
                </div>
                <div className="space-y-1">
                  {section.pages.map((page) => {
                    const isActive = page.id === activePage.id;

                    return (
                      <button
                        key={page.id}
                        onClick={() => onNavigate({ version: resolvedVersion, page: page.id })}
                        className={`w-full text-left px-3 py-2 rounded-md text-xs transition ${
                          isActive
                            ? 'bg-tropicalTeal/20 text-tropicalTeal border border-tropicalTeal/40'
                            : 'text-gray-300 hover:bg-white/5 hover:text-white border border-transparent'
                        }`}
                      >
                        {page.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-6">
            <header className="rounded-xl border border-white/10 bg-black/20 p-4 md:p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h1 className="text-xl md:text-2xl font-bold text-white">{activePage.title}</h1>
                  <p className="text-sm text-gray-300 max-w-3xl">{activePage.description}</p>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="docs-version" className="text-[11px] uppercase tracking-wide text-gray-500">
                    Version
                  </label>
                  <select
                    id="docs-version"
                    className="h-9 rounded-md border border-white/15 bg-black/40 px-2 text-xs text-white"
                    value={resolvedVersion}
                    onChange={(event) =>
                      onNavigate({
                        version: event.target.value,
                        page: activePage.id,
                      })
                    }
                  >
                    {availableVersions.map((version) => (
                      <option key={version} value={version}>
                        {version}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                <span className="rounded bg-white/5 px-2 py-1">Resolved: {docsVersion.id}</span>
                <span className="rounded bg-white/5 px-2 py-1">Package: {docsVersion.packageVersion}</span>
                <span className="rounded bg-white/5 px-2 py-1">Release date: {docsVersion.releaseDate}</span>
                {resolvedVersion === DOCS_LATEST_VERSION && (
                  <span className="rounded bg-tropicalTeal/10 text-tropicalTeal px-2 py-1 border border-tropicalTeal/30">
                    latest alias
                  </span>
                )}
              </div>
            </header>

            {activePage.sections.map((section) => (
              <section key={section.id} className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4 md:p-5">
                <h2 className="text-base font-semibold text-white">{section.title}</h2>

                {section.paragraphs?.map((paragraph, index) => (
                  <p key={`${section.id}-p-${index}`} className="text-sm text-gray-300 leading-relaxed">
                    {paragraph}
                  </p>
                ))}

                {section.bullets && section.bullets.length > 0 && (
                  <ul className="space-y-2 list-disc pl-5 text-sm text-gray-300">
                    {section.bullets.map((bullet, index) => (
                      <li key={`${section.id}-b-${index}`}>{bullet}</li>
                    ))}
                  </ul>
                )}

                {section.snippets && section.snippets.length > 0 && (
                  <div className="space-y-3">
                    {section.snippets.map((snippet) => (
                      <CodeBlock
                        key={`${section.id}-${snippet.title}-${snippet.language}`}
                        snippet={snippet}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}

            {activePage.id === 'examples' && <ExamplesRunner examples={docsVersion.runnableExamples} />}
          </div>
        </main>
      </div>
    </div>
  );
};

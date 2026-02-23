import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodeBlock } from "@/components/CodeBlock";
import {
  findDocsPage,
  getAvailableDocsVersions,
  getDocsVersion,
  resolveDocsVersionLabel,
} from "@/docs";
import { PACKAGE_NAME } from "@/config/version";
import type {
  DocsCalloutVariant,
  DocsContentBlock,
  DocsContentSection,
  DocsLinkCard,
  DocsNavigationSection,
  DocsPage,
} from "@/docs/types";
import {
  Lightbulb,
  NotePencil,
  Warning,
  Info,
  CaretRight,
  CaretLeft,
  List,
  X,
  RocketLaunch,
  Cpu,
  Code,
  BookOpenText,
  Gauge,
  Plugs,
  Wrench,
  ArrowsClockwise,
  ChartBar,
  Terminal,
  ListBullets,
  Function as FunctionIcon,
  CookingPot,
  Images,
  Lightning,
  Play,
  Package,
} from "@phosphor-icons/react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Dock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DocsViewProps {
  requestedVersion: string;
  requestedPage: string;
  onNavigate: (next: { version: string; page: string }) => void;
}

// ---------------------------------------------------------------------------
// Icon registry (used for link-cards only)
// ---------------------------------------------------------------------------

const CARD_ICON_MAP: Record<string, PhosphorIcon> = {
  overview: BookOpenText,
  installation: Package,
  "quick-start": RocketLaunch,
  "integration-guide": Plugs,
  "simulation-api": Cpu,
  "constructor-reference": Wrench,
  "run-frame-reference": Play,
  "runtime-updates": ArrowsClockwise,
  "backends-rendering": Gauge,
  "tracking-benchmarking": ChartBar,
  "custom-source": Code,
  troubleshooting: Warning,
  "dsl-basics": Terminal,
  "dsl-commands": ListBullets,
  "dsl-functions": FunctionIcon,
  "dsl-patterns": CookingPot,
  "preset-gallery": Images,
  "dsl-performance": Lightning,
  examples: Play,
};

const SECTION_ICON_MAP: Record<string, PhosphorIcon> = {
  "getting-started": RocketLaunch,
  "core-api": Cpu,
  "dsl-guide": Code,
  examples: Play,
};

// ---------------------------------------------------------------------------
// Callout config
// ---------------------------------------------------------------------------

const CALLOUT_CONFIG: Record<
  DocsCalloutVariant,
  {
    icon: PhosphorIcon;
    label: string;
    border: string;
    bg: string;
    text: string;
  }
> = {
  tip: {
    icon: Lightbulb,
    label: "Tip",
    border: "border-l-emerald-400",
    bg: "bg-emerald-500/[0.06]",
    text: "text-emerald-300",
  },
  note: {
    icon: NotePencil,
    label: "Note",
    border: "border-l-blue-400",
    bg: "bg-blue-500/[0.06]",
    text: "text-blue-300",
  },
  warning: {
    icon: Warning,
    label: "Warning",
    border: "border-l-amber-400",
    bg: "bg-amber-500/[0.06]",
    text: "text-amber-300",
  },
  info: {
    icon: Info,
    label: "Info",
    border: "border-l-cyan-400",
    bg: "bg-cyan-500/[0.06]",
    text: "text-cyan-300",
  },
};

// ---------------------------------------------------------------------------
// Inline text renderer — handles **bold** (which may contain `code`)
// ---------------------------------------------------------------------------

function InlineCode({ text }: { text: string }) {
  const segments = text.split(/(`[^`]+`)/g);
  return (
    <>
      {segments.map((segment, i) => {
        if (segment.startsWith("`") && segment.endsWith("`")) {
          return (
            <code
              key={i}
              className="px-1.5 py-0.5 rounded bg-white/[0.08] text-tropicalTeal text-[0.85em] font-mono"
            >
              {segment.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{segment}</span>;
      })}
    </>
  );
}

function InlineText({ text }: { text: string }) {
  const segments = text.split(/(\*\*(?:(?!\*\*).)+\*\*)/g);
  return (
    <>
      {segments.map((segment, i) => {
        if (segment.startsWith("**") && segment.endsWith("**")) {
          const inner = segment.slice(2, -2);
          return (
            <strong key={i} className="font-semibold text-white">
              <InlineCode text={inner} />
            </strong>
          );
        }
        return <InlineCode key={i} text={segment} />;
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Content block sub-components
// ---------------------------------------------------------------------------

function CalloutBlock({
  variant,
  title,
  text,
}: {
  variant: DocsCalloutVariant;
  title?: string;
  text: string;
}) {
  const config = CALLOUT_CONFIG[variant];
  const Icon = config.icon;

  return (
    <div
      className={`rounded-r-lg border-l-[3px] ${config.border} ${config.bg} px-4 py-3.5 my-1`}
    >
      <div
        className={`flex items-center gap-2 ${config.text} text-sm font-semibold mb-1.5`}
      >
        <Icon size={16} weight="bold" />
        <span>{title ?? config.label}</span>
      </div>
      <div className="text-sm text-gray-300 leading-relaxed">
        <InlineText text={text} />
      </div>
    </div>
  );
}

function TableBlock({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10 my-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03]">
            {headers.map((header, i) => (
              <th
                key={i}
                className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={`border-b border-white/[0.05] last:border-0 ${rowIndex % 2 === 1 ? "bg-white/[0.015]" : ""}`}
            >
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-2.5 text-gray-300">
                  <InlineText text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinkCards({
  cards,
  version,
  onNavigate,
}: {
  cards: DocsLinkCard[];
  version: string;
  onNavigate: (next: { version: string; page: string }) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 my-1">
      {cards.map((card) => {
        const Icon =
          CARD_ICON_MAP[card.icon] ?? CARD_ICON_MAP[card.page] ?? CaretRight;
        return (
          <button
            key={card.page}
            onClick={() => onNavigate({ version, page: card.page })}
            className="group flex flex-col gap-2 text-left p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:border-tropicalTeal/30 hover:bg-tropicalTeal/[0.04] transition-all"
          >
            <div className="w-8 h-8 rounded-lg bg-tropicalTeal/[0.1] border border-tropicalTeal/20 flex items-center justify-center group-hover:bg-tropicalTeal/[0.15] transition-colors">
              <Icon size={18} weight="duotone" className="text-tropicalTeal" />
            </div>
            <div className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
              {card.title}
            </div>
            <div className="text-xs text-gray-500 leading-relaxed">
              {card.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content block renderer
// ---------------------------------------------------------------------------

function ContentBlockRenderer({
  block,
  sectionId,
  index,
  version,
  onNavigate,
}: {
  block: DocsContentBlock;
  sectionId: string;
  index: number;
  version: string;
  onNavigate: (next: { version: string; page: string }) => void;
}) {
  const key = `${sectionId}-block-${index}`;

  switch (block.kind) {
    case "paragraph":
      return (
        <p key={key} className="text-[15px] text-gray-300 leading-[1.75]">
          <InlineText text={block.text} />
        </p>
      );

    case "heading":
      return (
        <h3 key={key} className="text-base font-semibold text-white mt-4 mb-1">
          <InlineText text={block.text} />
        </h3>
      );

    case "bullets":
      return (
        <ul
          key={key}
          className="space-y-1.5 list-disc pl-5 text-[15px] text-gray-300 leading-[1.75]"
        >
          {block.items.map((item, i) => (
            <li key={`${key}-${i}`}>
              <InlineText text={item} />
            </li>
          ))}
        </ul>
      );

    case "ordered-list":
      return (
        <ol
          key={key}
          className="space-y-1.5 list-decimal pl-5 text-[15px] text-gray-300 leading-[1.75]"
        >
          {block.items.map((item, i) => (
            <li key={`${key}-${i}`}>
              <InlineText text={item} />
            </li>
          ))}
        </ol>
      );

    case "code":
      return <CodeBlock key={key} snippet={block.snippet} />;

    case "callout":
      return (
        <CalloutBlock
          key={key}
          variant={block.variant}
          title={block.title}
          text={block.text}
        />
      );

    case "table":
      return <TableBlock key={key} headers={block.headers} rows={block.rows} />;

    case "link-cards":
      return (
        <LinkCards
          key={key}
          cards={block.cards}
          version={version}
          onNavigate={onNavigate}
        />
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Section content renderer
// ---------------------------------------------------------------------------

function SectionContent({
  section,
  version,
  onNavigate,
}: {
  section: DocsContentSection;
  version: string;
  onNavigate: (next: { version: string; page: string }) => void;
}) {
  if (section.content && section.content.length > 0) {
    return (
      <div className="space-y-4">
        {section.content.map((block, i) => (
          <ContentBlockRenderer
            key={`${section.id}-${i}`}
            block={block}
            sectionId={section.id}
            index={i}
            version={version}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {section.paragraphs?.map((paragraph, index) => (
        <p
          key={`${section.id}-p-${index}`}
          className="text-[15px] text-gray-300 leading-[1.75]"
        >
          <InlineText text={paragraph} />
        </p>
      ))}

      {section.bullets && section.bullets.length > 0 && (
        <ul className="space-y-1.5 list-disc pl-5 text-[15px] text-gray-300 leading-[1.75]">
          {section.bullets.map((bullet, index) => (
            <li key={`${section.id}-b-${index}`}>
              <InlineText text={bullet} />
            </li>
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page navigation (prev / next)
// ---------------------------------------------------------------------------

function PageNavigation({
  prev,
  next,
  version,
  onNavigate,
}: {
  prev: Pick<DocsPage, "id" | "title"> | null;
  next: Pick<DocsPage, "id" | "title"> | null;
  version: string;
  onNavigate: (next: { version: string; page: string }) => void;
}) {
  if (!prev && !next) return null;

  return (
    <nav className="grid grid-cols-2 gap-4 pt-10 mt-10 border-t border-white/[0.06]">
      {prev ? (
        <button
          onClick={() => onNavigate({ version, page: prev.id })}
          className="group flex items-center gap-3 text-left px-4 py-3.5 rounded-lg border border-white/[0.08] hover:border-tropicalTeal/30 hover:bg-tropicalTeal/[0.04] transition-all"
        >
          <CaretLeft
            size={16}
            className="text-gray-500 group-hover:text-tropicalTeal transition-colors shrink-0"
          />
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-0.5">
              Previous
            </div>
            <div className="text-sm text-gray-200 group-hover:text-white truncate transition-colors">
              {prev.title}
            </div>
          </div>
        </button>
      ) : (
        <div />
      )}

      {next ? (
        <button
          onClick={() => onNavigate({ version, page: next.id })}
          className="group flex items-center justify-end gap-3 text-right px-4 py-3.5 rounded-lg border border-white/[0.08] hover:border-tropicalTeal/30 hover:bg-tropicalTeal/[0.04] transition-all"
        >
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-0.5">
              Next
            </div>
            <div className="text-sm text-gray-200 group-hover:text-white truncate transition-colors">
              {next.title}
            </div>
          </div>
          <CaretRight
            size={16}
            className="text-gray-500 group-hover:text-tropicalTeal transition-colors shrink-0"
          />
        </button>
      ) : (
        <div />
      )}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// On this page (right sidebar)
// ---------------------------------------------------------------------------

function OnThisPage({
  sections,
  activeSectionId,
}: {
  sections: DocsContentSection[];
  activeSectionId: string;
}) {
  const handleClick = useCallback((sectionId: string) => {
    document
      .getElementById(sectionId)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (sections.length <= 1) return null;

  return (
    <div className="sticky top-8 ml-3">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">
        On this page
      </h4>
      <ul className="space-y-1 border-l border-white/[0.06]">
        {sections.map((section) => {
          const isActive = section.id === activeSectionId;
          return (
            <li key={section.id}>
              <button
                onClick={() => handleClick(section.id)}
                className={`block w-full text-left text-xs pl-3 py-1 -ml-px border-l-2 transition-colors ${
                  isActive
                    ? "border-tropicalTeal text-tropicalTeal"
                    : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600"
                }`}
              >
                {section.title}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findPageSection(
  sections: DocsNavigationSection[],
  pageId: string,
): string | undefined {
  for (const section of sections) {
    if (section.pages.some((p) => p.id === pageId)) {
      return section.title;
    }
  }
  return undefined;
}

function findPageSectionId(
  sections: DocsNavigationSection[],
  pageId: string,
): string | undefined {
  for (const section of sections) {
    if (section.pages.some((p) => p.id === pageId)) {
      return section.id;
    }
  }
  return undefined;
}

function getAllPagesOrdered(
  sections: DocsNavigationSection[],
): Array<Pick<DocsPage, "id" | "title">> {
  return sections.flatMap((s) => s.pages);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const DocsView = ({
  requestedVersion,
  requestedPage,
  onNavigate,
}: DocsViewProps) => {
  const docsVersion = getDocsVersion(requestedVersion);
  const resolvedVersion = resolveDocsVersionLabel(requestedVersion);
  const availableVersions = getAvailableDocsVersions();
  const activePage = findDocsPage(docsVersion, requestedPage);

  const mainRef = useRef<HTMLDivElement>(null);
  const [activeSectionId, setActiveSectionId] = useState(
    activePage.sections[0]?.id ?? "",
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const sectionTitle = findPageSection(docsVersion.sections, activePage.id);
  const sectionId = findPageSectionId(docsVersion.sections, activePage.id);

  const allPages = useMemo(
    () => getAllPagesOrdered(docsVersion.sections),
    [docsVersion.sections],
  );
  const currentPageIndex = allPages.findIndex((p) => p.id === activePage.id);
  const prevPage = currentPageIndex > 0 ? allPages[currentPageIndex - 1] : null;
  const nextPage =
    currentPageIndex < allPages.length - 1
      ? allPages[currentPageIndex + 1]
      : null;

  useEffect(() => {
    if (
      requestedVersion !== resolvedVersion ||
      requestedPage !== activePage.id
    ) {
      onNavigate({ version: resolvedVersion, page: activePage.id });
    }
  }, [
    activePage.id,
    onNavigate,
    requestedPage,
    requestedVersion,
    resolvedVersion,
  ]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    setActiveSectionId(activePage.sections[0]?.id ?? "");
  }, [activePage.id, activePage.sections]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSectionId(entry.target.id);
          }
        }
      },
      { root: main, rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );

    activePage.sections.forEach((section) => {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [activePage.sections]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [activePage.id]);

  return (
    <div className="h-full w-full overflow-hidden bg-[#0a1a1f]">
      <div className="h-full grid grid-cols-1 lg:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_200px]">
        {/* ---- Mobile nav toggle ---- */}
        <button
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          className="lg:hidden fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-tropicalTeal text-jetBlack flex items-center justify-center shadow-lg shadow-tropicalTeal/20"
          aria-label="Toggle navigation"
        >
          {mobileNavOpen ? (
            <X size={20} weight="bold" />
          ) : (
            <List size={20} weight="bold" />
          )}
        </button>

        {/* ---- Left sidebar ---- */}
        <aside
          className={`${
            mobileNavOpen
              ? "fixed inset-0 z-40 bg-[#0a1a1f]/95 backdrop-blur-sm"
              : "hidden"
          } lg:relative lg:block border-r border-white/[0.06] overflow-y-auto`}
        >
          {/* Sidebar header */}
          <div className="p-2 m-3 mb-1 rounded-xl bg-gradient-to-br  to-transparent ">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-tropicalTeal/20 flex items-center justify-center">
                <Dock size={18} className="text-tropicalTeal" />
              </div>
              <div>
                <div className="text-sm font-bold text-white tracking-tight leading-tight">
                  {PACKAGE_NAME}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  Documentation
                </div>
              </div>
            </div>
            <div className="mt-3">
              <Select
                value={resolvedVersion}
                onValueChange={(value) =>
                  onNavigate({ version: value, page: activePage.id })
                }
              >
                <SelectTrigger className="w-full h-7 rounded-md border border-white/[0.06] bg-black/20 hover:bg-black/40 px-2.5 text-[11px] font-medium text-gray-400 focus:outline-none focus:ring-0 focus:border-white/[0.12] focus-visible:ring-0 cursor-pointer data-[state=open]:bg-black/40 transition-colors shadow-none">
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent className="bg-[#0c1317] border border-white/[0.08] shadow-xl shadow-black/40">
                  {availableVersions.map((version) => (
                    <SelectItem
                      key={version}
                      value={version}
                      className="text-[11px] font-medium text-gray-400 focus:bg-white/[0.04] focus:text-white cursor-pointer py-1.5 pl-6"
                    >
                      {version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <nav className="px-3 pb-6 pt-2 space-y-5">
            {docsVersion.sections.map((section) => {
              const SectionIcon = SECTION_ICON_MAP[section.id];
              return (
                <div key={section.id}>
                  <div className="px-2 mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    {SectionIcon && (
                      <SectionIcon
                        size={13}
                        weight="bold"
                        className="opacity-70"
                      />
                    )}
                    {section.title}
                  </div>
                  <ul className="space-y-0.5">
                    {section.pages.map((page) => {
                      const isActive = page.id === activePage.id;
                      return (
                        <li key={page.id}>
                          <button
                            onClick={() =>
                              onNavigate({
                                version: resolvedVersion,
                                page: page.id,
                              })
                            }
                            className={`w-full text-left px-3 pt-1.5 pb-1 rounded-md text-[13px] transition-colors ${
                              isActive
                                ? "bg-tropicalTeal/[0.12] text-tropicalTeal font-medium"
                                : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]"
                            }`}
                          >
                            {page.title}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>
        </aside>

        {/* ---- Main content ---- */}
        <main ref={mainRef} className="overflow-y-auto scroll-smooth">
          <article className="max-w-3xl mx-auto px-5 md:px-10 py-8 md:py-12">
            {/* Page header */}
            <header className="mb-10">
              {sectionTitle && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-tropicalTeal/80 uppercase tracking-widest mb-3">
                  {sectionId &&
                    SECTION_ICON_MAP[sectionId] &&
                    (() => {
                      const SIcon = SECTION_ICON_MAP[sectionId];
                      return (
                        <SIcon size={13} weight="bold" className="opacity-70" />
                      );
                    })()}
                  {sectionTitle}
                </div>
              )}
              <h1 className="text-2xl md:text-[2rem] font-bold text-white leading-tight tracking-tight">
                {activePage.title}
              </h1>
              <p className="mt-3 text-base text-gray-400 leading-relaxed max-w-2xl">
                {activePage.description}
              </p>
            </header>

            {/* Sections */}
            {activePage.sections.map((section, sectionIndex) => (
              <section
                key={section.id}
                id={section.id}
                className={`scroll-mt-8 ${sectionIndex > 0 ? "pt-10 mt-10 border-t border-white/[0.05]" : ""}`}
              >
                <h2 className="text-lg font-semibold text-white mb-4 tracking-tight">
                  {section.title}
                </h2>
                <SectionContent
                  section={section}
                  version={resolvedVersion}
                  onNavigate={onNavigate}
                />
              </section>
            ))}

            {/* Prev / Next */}
            <PageNavigation
              prev={prevPage}
              next={nextPage}
              version={resolvedVersion}
              onNavigate={onNavigate}
            />
          </article>
        </main>

        {/* ---- Right sidebar: on this page ---- */}
        <aside className="hidden xl:block overflow-y-auto py-12 pr-4">
          <OnThisPage
            sections={activePage.sections}
            activeSectionId={activeSectionId}
          />
        </aside>
      </div>
    </div>
  );
};

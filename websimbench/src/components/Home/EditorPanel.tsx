import { useState, useRef } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CircleNotch,
  CaretDown,
  FloppyDisk,
  UploadSimple,
  PencilLineIcon,
  BookOpen,
  BookOpenText,
  ListBullets,
  Eye,
  Function as FunctionIcon,
  RocketLaunch,
} from "@phosphor-icons/react";
import { NavDropdown } from "@/components/ui/nav-dropdown";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import Editor from "react-simple-code-editor";
import { highlight, languages } from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-wasm";

import { PREMADE_SIMULATIONS } from "../../config/premadeSimulations";
import { DOCS_LATEST_VERSION } from "@/config/version";
import { createHashRoute } from "@/lib/routes";
import "./EditorPanel.css";

interface EditorPanelProps {
  code: string;
  setCode: (code: string) => void;
  handleSaveCode: () => void;
  handleLoadCode: (e: React.ChangeEvent<HTMLInputElement>) => void;
  compiledCode: { js: string; wasm: string; wgsl: string };
  isCompiling: boolean;
  compileErrors: { message: string; lineIndex: number }[];
}

const editorStyle = {
  fontFamily: '"Fira code", "Fira Mono", monospace',
  fontSize: 14,
  minHeight: "100%",
  backgroundColor: "rgba(0, 0, 0, 0.1)",
};

const DSL_DOC_LINKS = [
  { label: "DSL Basics", page: "dsl-basics", icon: BookOpenText },
  { label: "Commands", page: "dsl-commands", icon: ListBullets },
  { label: "Functions", page: "dsl-functions", icon: FunctionIcon },
];

export const EditorPanel = ({
  code,
  setCode,
  handleSaveCode,
  handleLoadCode,
  compiledCode,
  isCompiling,
  compileErrors,
}: EditorPanelProps) => {
  const [activeTab, setActiveTab] = useState("sim-code");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditorEmpty = code.trim().length === 0;

  const navigateToDocsPage = (docsPage: string) => {
    if (typeof window === "undefined") return;
    window.location.hash = createHashRoute({
      page: "docs",
      version: DOCS_LATEST_VERSION,
      docsPage,
    });
  };

  const handleLoadPremade = (simCode: string) => {
    // Confirm before overwriting if the code is not empty?
    // For now, just overwrite as requested by "load" behavior usually implies replacement.
    // If we wanted to be safer we could check if code !== DEFAULT_CODE etc.
    setCode(simCode);
  };

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <NavDropdown
          icon={<PencilLineIcon size={16} />}
          label="Editor"
          value={activeTab}
          onValueChange={setActiveTab}
          options={[
            { value: "sim-code", label: "Agent Code" },
            {
              value: "wasm",
              label: "WASM",
              icon: <Eye size={11} weight="bold" />,
              iconClassName: "nav-dropdown-option-icon-readonly",
            },
            {
              value: "javascript",
              label: "JS",
              icon: <Eye size={11} weight="bold" />,
              iconClassName: "nav-dropdown-option-icon-readonly",
            },
            {
              value: "wgsl",
              label: "WGSL",
              icon: <Eye size={11} weight="bold" />,
              iconClassName: "nav-dropdown-option-icon-readonly",
            },
          ]}
        />

        <div className="editor-actions">
          {isCompiling && (
            <div className="editor-compiling">
              <CircleNotch size={18} className="animate-spin" />
              Compiling...
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Premade Simulations"
                className="editor-simulations-trigger"
              >
                <span className="editor-simulations-label">
                  <BookOpen size={14} weight="bold" />
                  Simulations
                </span>
                <CaretDown size={12} weight="bold" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="editor-simulations-menu-content"
            >
              {Object.entries(PREMADE_SIMULATIONS).map(([name, simulation]) => {
                const Icon = simulation.icon;
                return (
                  <DropdownMenuItem
                    key={name}
                    className="editor-simulation-item"
                    onClick={() => handleLoadPremade(simulation.code)}
                  >
                    <span className="editor-simulation-item-icon">
                      <Icon size={14} weight="bold" />
                    </span>
                    <span className="editor-simulation-item-text">
                      <span className="editor-simulation-item-title">
                        {name}
                      </span>
                      <span className="editor-simulation-item-description">
                        {simulation.description}
                      </span>
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <HeaderIconButton
            onClick={handleSaveCode}
            title="Save Simulation"
            icon={<FloppyDisk size={18} />}
            label="Save"
          />

          <HeaderIconButton
            onClick={() => fileInputRef.current?.click()}
            title="Load Simulation"
            icon={<UploadSimple size={18} />}
            label="Load"
          />
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleLoadCode}
            style={{ display: "none" }}
            accept=".js,.ts,.txt,.sim"
          />
        </div>
      </div>

      <div className="editor-content-area">
        <div
          className={`editor-content-tab ${activeTab !== "sim-code" ? "hidden" : ""}`}
        >
          <div className="editor-code-wrapper">
            <Editor
              value={code}
              onValueChange={setCode}
              highlight={(code) => {
                const lines = code.split("\n");
                return lines
                  .map((lineContent, i) => {
                    const error = compileErrors.find((e) => e.lineIndex === i);
                    const highlighted = highlight(
                      lineContent,
                      languages.js,
                      "js",
                    );
                    if (error) {
                      return `<span style="text-decoration: underline wavy red; text-decoration-skip-ink: none; background-color: rgba(255, 0, 0, 0.1);" title="${error.message}">${highlighted || " "}</span>`;
                    }
                    return highlighted || " ";
                  })
                  .join("\n");
              }}
              padding={16}
              style={editorStyle}
              textareaClassName="focus:outline-none"
              className="agentyx-code"
            />

            {isEditorEmpty && (
              <div className="editor-empty-placeholder">
                <p className="editor-empty-title">No simulation code yet.</p>
                <p className="editor-empty-subtitle">
                  Start typing, or jump to the DSL docs:
                </p>
                <div className="editor-empty-links">
                  {DSL_DOC_LINKS.map((item) => (
                    <button
                      type="button"
                      key={item.page}
                      className="editor-empty-link-btn"
                      onClick={() => navigateToDocsPage(item.page)}
                    >
                      <item.icon size={14} weight="bold" />
                      {item.label}
                    </button>
                  ))}
                  <div style={{ flex: 1, flexBasis: "100%" }}></div>
                  <button
                    type="button"
                    className="editor-empty-link-btn editor-empty-link-btn-primary"
                    onClick={() =>
                      handleLoadPremade(PREMADE_SIMULATIONS["Tutorial"].code)
                    }
                  >
                    <RocketLaunch size={14} weight="bold" />
                    Load Example
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div
          className={`editor-content-tab ${activeTab !== "wasm" ? "hidden" : ""}`}
        >
          <Editor
            value={compiledCode.wasm}
            onValueChange={() => {}}
            highlight={(code) =>
              highlight(code, languages.wasm || languages.js, "wasm")
            }
            padding={16}
            readOnly
            style={editorStyle}
            className="agentyx-code"
          />
        </div>
        <div
          className={`editor-content-tab ${activeTab !== "javascript" ? "hidden" : ""}`}
        >
          <Editor
            value={compiledCode.js}
            onValueChange={() => {}}
            highlight={(code) => highlight(code, languages.js, "js")}
            padding={16}
            readOnly
            style={editorStyle}
            className="agentyx-code"
          />
        </div>
        <div
          className={`editor-content-tab ${activeTab !== "wgsl" ? "hidden" : ""}`}
        >
          <Editor
            value={compiledCode.wgsl}
            onValueChange={() => {}}
            highlight={(code) =>
              highlight(code, languages.clike || languages.js, "clike")
            }
            padding={16}
            readOnly
            style={editorStyle}
            className="agentyx-code"
          />
        </div>
      </div>
    </div>
  );
};

import { useState, useRef, useEffect } from "react";
import { Compiler, InputDefinition, Logger } from "@websimbench/agentyx";
import { useCodeFormatter } from "./useCodeFormatter";
import { useLocalStorageString } from "./useLocalStorage";

const DEFAULT_CODE = "";

/**
 * Hook bridging the frontend editor with the core Agentyx WebAssembly compiler pipeline.
 * Manages raw user code, triggers the compilation step on debounce, and handles any output errors.
 *
 * @returns Comprehensive state linking input behaviors, compiled output blobs, and manual file operations.
 */
export function useCodeCompiler() {
  const { formatCode } = useCodeFormatter();
  const [code, setCode] = useLocalStorageString(
    "websimbench_code",
    DEFAULT_CODE,
  );
  const [compiledCode, setCompiledCode] = useState<{
    js: string;
    wasm: string;
    wgsl: string;
  }>({ js: "", wasm: "", wgsl: "" });
  const [inputs, setInputs] = useState<Record<string, number>>({
    agentCount: 1000,
  });
  const [definedInputs, setDefinedInputs] = useState<InputDefinition[]>([]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileErrors, setCompileErrors] = useState<
    { message: string; lineIndex: number }[]
  >([]);

  const compilerRef = useRef(new Compiler());
  const compileTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    setIsCompiling(true);
    if (compileTimeoutRef.current) clearTimeout(compileTimeoutRef.current);

    compileTimeoutRef.current = setTimeout(async () => {
      try {
        const result = compilerRef.current.compileAgentCode(code);
        const formattedJs = await formatCode(result.jsCode, "babel");

        setCompiledCode({
          js: formattedJs,
          wasm: result.WASMCode,
          wgsl: result.wgslCode,
        });

        setCompileErrors(result.errors || []);

        if (result.definedInputs) {
          setDefinedInputs(result.definedInputs);
          setInputs((prev) => {
            const newInputs = { ...prev };
            if (!newInputs.agentCount) newInputs.agentCount = 1000;
            result.definedInputs.forEach((def) => {
              if (!(def.name in newInputs)) {
                newInputs[def.name] = def.defaultValue;
              }
            });
            return newInputs;
          });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const logger = new Logger("Compiler", "red");
        logger.error(message);
      } finally {
        setIsCompiling(false);
      }
    }, 1000);

    return () => {
      if (compileTimeoutRef.current) clearTimeout(compileTimeoutRef.current);
    };
  }, [code]);

  const handleInputChange = (key: string, value: number) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveCode = () => {
    const blob = new Blob([code], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "simulation.js";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadCode = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (typeof content === "string") setCode(content);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return {
    code,
    setCode,
    compiledCode,
    inputs,
    definedInputs,
    isCompiling,
    compileErrors,
    handleInputChange,
    handleSaveCode,
    handleLoadCode,
  };
}

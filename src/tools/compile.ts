import { existsSync } from "fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runExecutable } from "../utils/executor.js";
import {
  resolveAndValidateMql5Path,
  toWindowsRelPath,
} from "../utils/paths.js";
import { parseCompileLog } from "../utils/log-parser.js";

export function registerCompileTools(server: McpServer): void {
  server.tool(
    "compile_mql5",
    "Compile a MQL5 file using MetaEditor CLI. Returns compilation result with errors/warnings.",
    {
      path: z
        .string()
        .describe("Path relative to MQL5/ (e.g. Experts/MyEA.mq5)"),
    },
    async ({ path }) => {
      const abs = resolveAndValidateMql5Path(path);
      if (!existsSync(abs)) {
        return {
          content: [
            { type: "text" as const, text: `File not found: ${path}` },
          ],
          isError: true,
        };
      }

      const winPath = toWindowsRelPath(path);
      const result = await runExecutable(
        "MetaEditor64.exe",
        [
          `/compile:${winPath}`,
          "/log",
          "/portable",
        ],
        30000
      );

      // The .log file is generated next to the .mq5 file
      const logPath = abs.replace(/\.mq[45]$/, ".log");

      if (!existsSync(logPath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Compilation may have failed. No log generated.\nStderr: ${result.stderr}`,
            },
          ],
          isError: true,
        };
      }

      const compiled = await parseCompileLog(logPath);
      const summary = [
        `Compilation ${compiled.success ? "SUCCEEDED" : "FAILED"}`,
        `Errors: ${compiled.errors}, Warnings: ${compiled.warnings}`,
        compiled.elapsed ? `Time: ${compiled.elapsed}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const details = compiled.messages
        .map(
          (m) =>
            `${m.file}(${m.line},${m.column}): ${m.type} ${m.code}: ${m.message}`
        )
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: details ? `${summary}\n\n${details}` : summary,
          },
        ],
        isError: !compiled.success,
      };
    }
  );

  server.tool(
    "get_compile_errors",
    "Read and parse the compilation log for a MQL5 file",
    {
      path: z
        .string()
        .describe(
          "Path relative to MQL5/ (e.g. Experts/MyEA.mq5). The .log file next to it is read."
        ),
    },
    async ({ path }) => {
      const abs = resolveAndValidateMql5Path(path);
      const logPath = abs.replace(/\.mq[45]$/, ".log");

      if (!existsSync(logPath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No compilation log found for: ${path}. Compile the file first.`,
            },
          ],
          isError: true,
        };
      }

      const compiled = await parseCompileLog(logPath);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(compiled, null, 2),
          },
        ],
      };
    }
  );
}

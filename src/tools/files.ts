import { readdir, stat, readFile, writeFile, mkdir } from "fs/promises";
import { resolve, extname, dirname } from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  resolveTypeDirs,
  resolveAndValidateMql5Path,
  toMql5Relative,
} from "../utils/paths.js";

interface FileEntry {
  path: string;
  size: number;
  modified: string;
}

async function listFilesRecursive(
  dir: string,
  pattern: string | undefined,
  results: FileEntry[],
  basePath: string
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      await listFilesRecursive(full, pattern, results, basePath);
    } else if (
      entry.name.endsWith(".mq5") ||
      entry.name.endsWith(".mqh") ||
      entry.name.endsWith(".mq4")
    ) {
      if (pattern && !entry.name.includes(pattern)) continue;
      const info = await stat(full);
      results.push({
        path: toMql5Relative(full),
        size: info.size,
        modified: info.mtime.toISOString(),
      });
    }
  }
}

export function registerFileTools(server: McpServer): void {
  server.tool(
    "list_mql5_files",
    "List MQL5 source files (experts, indicators, scripts, includes)",
    {
      type: z
        .enum(["experts", "indicators", "scripts", "include", "all"])
        .describe("Type of files to list"),
      pattern: z
        .string()
        .optional()
        .describe("Optional filename filter substring"),
    },
    async ({ type, pattern }) => {
      const dirs = resolveTypeDirs(type);
      const results: FileEntry[] = [];
      for (const dir of dirs) {
        await listFilesRecursive(dir, pattern, results, dir);
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "read_mql5_file",
    "Read a MQL5 source file",
    {
      path: z
        .string()
        .describe("Path relative to MQL5/ (e.g. Experts/MyEA.mq5)"),
    },
    async ({ path }) => {
      const abs = resolveAndValidateMql5Path(path);
      const content = await readFile(abs, "utf-8");
      return {
        content: [{ type: "text" as const, text: content }],
      };
    }
  );

  server.tool(
    "write_mql5_file",
    "Create or overwrite a MQL5 source file",
    {
      path: z
        .string()
        .describe("Path relative to MQL5/ (e.g. Experts/MyEA.mq5)"),
      content: z.string().describe("Full MQL5 source code"),
    },
    async ({ path, content }) => {
      const abs = resolveAndValidateMql5Path(path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content, "utf-8");
      return {
        content: [
          {
            type: "text" as const,
            text: `File written: ${abs}`,
          },
        ],
      };
    }
  );
}

# MCP MetaEditor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server that lets Claude Code write, compile, and backtest MQL5 code on MetaTrader 5 via Wine on Linux.

**Architecture:** Stateless stdio MCP server in TypeScript. Each tool call spawns a short-lived Wine process or reads the filesystem. No database, no persistent state. The server must `cd` into the MT5 directory and use `/portable` flag for MetaEditor CLI compilation.

**Tech Stack:** Node.js, TypeScript, `@modelcontextprotocol/sdk`, `child_process`, `iconv-lite` (UTF-16LE log parsing)

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `src/index.ts` (minimal placeholder)

- [ ] **Step 1: Initialize package.json**

```bash
cd /home/ctpn3m0/Documents/GitHub/mcp-metaeditor
npm init -y
```

Then edit `package.json`:

```json
{
  "name": "mcp-metaeditor",
  "version": "0.1.0",
  "description": "MCP server for MetaTrader 5 MetaEditor on Linux/Wine",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @modelcontextprotocol/sdk iconv-lite dotenv
npm install -D typescript @types/node
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create .env.example**

```
MT5_WINEPREFIX=/home/ctpn3m0/.mt5
MT5_PATH=/home/ctpn3m0/.mt5/drive_c/Program Files/MetaTrader 5
```

- [ ] **Step 5: Create minimal src/index.ts**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "mcp-metaeditor",
  version: "0.1.0",
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

- [ ] **Step 6: Verify it builds**

```bash
npx tsc
```

Expected: No errors, `dist/index.js` created.

- [ ] **Step 7: Commit**

```bash
git init
echo "node_modules/\ndist/\n.env" > .gitignore
git add package.json package-lock.json tsconfig.json .env.example .gitignore src/index.ts DESIGN.md PLAN.md
git commit -m "feat: project scaffolding with MCP server skeleton"
```

---

### Task 2: Config and Path Utilities

**Files:**
- Create: `src/config.ts`
- Create: `src/utils/paths.ts`

- [ ] **Step 1: Create src/config.ts**

```typescript
import { config } from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";

config();

function requiredEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const MT5_WINEPREFIX = requiredEnv(
  "MT5_WINEPREFIX",
  resolve(process.env.HOME || "", ".mt5")
);

export const MT5_PATH = requiredEnv(
  "MT5_PATH",
  resolve(MT5_WINEPREFIX, "drive_c/Program Files/MetaTrader 5")
);

export const MQL5_PATH = resolve(MT5_PATH, "MQL5");
export const METAEDITOR_EXE = resolve(MT5_PATH, "MetaEditor64.exe");
export const TERMINAL_EXE = resolve(MT5_PATH, "terminal64.exe");

export function validateConfig(): void {
  if (!existsSync(MT5_PATH)) {
    throw new Error(`MT5_PATH does not exist: ${MT5_PATH}`);
  }
  if (!existsSync(METAEDITOR_EXE)) {
    throw new Error(`MetaEditor64.exe not found at: ${METAEDITOR_EXE}`);
  }
  if (!existsSync(MQL5_PATH)) {
    throw new Error(`MQL5 directory not found at: ${MQL5_PATH}`);
  }
}
```

- [ ] **Step 2: Create src/utils/paths.ts**

```typescript
import { resolve, normalize, relative } from "path";
import { MQL5_PATH } from "../config.js";

const TYPE_DIRS: Record<string, string> = {
  experts: "Experts",
  indicators: "Indicators",
  scripts: "Scripts",
  include: "Include",
};

export function resolveTypeDirs(type: string): string[] {
  if (type === "all") {
    return Object.values(TYPE_DIRS).map((d) => resolve(MQL5_PATH, d));
  }
  const dir = TYPE_DIRS[type];
  if (!dir) {
    throw new Error(
      `Invalid type: ${type}. Must be one of: ${Object.keys(TYPE_DIRS).join(", ")}, all`
    );
  }
  return [resolve(MQL5_PATH, dir)];
}

export function resolveAndValidateMql5Path(relativePath: string): string {
  const abs = resolve(MQL5_PATH, relativePath);
  const rel = relative(MQL5_PATH, abs);
  if (rel.startsWith("..") || resolve(MQL5_PATH, rel) !== abs) {
    throw new Error(`Path traversal rejected: ${relativePath}`);
  }
  return abs;
}

export function toWindowsRelPath(relativePath: string): string {
  return "MQL5\\" + relativePath.replace(/\//g, "\\");
}

export function toMql5Relative(absolutePath: string): string {
  return relative(MQL5_PATH, absolutePath).replace(/\\/g, "/");
}
```

- [ ] **Step 3: Verify it builds**

```bash
npx tsc
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/config.ts src/utils/paths.ts
git commit -m "feat: add config and path utilities"
```

---

### Task 3: Wine Execution Utility

**Files:**
- Create: `src/utils/wine.ts`

- [ ] **Step 1: Create src/utils/wine.ts**

```typescript
import { execFile } from "child_process";
import { MT5_WINEPREFIX, MT5_PATH } from "../config.js";

export interface WineResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runWine(
  exe: string,
  args: string[],
  timeoutMs: number = 30000
): Promise<WineResult> {
  return new Promise((resolve) => {
    const child = execFile(
      "wine",
      [exe, ...args],
      {
        cwd: MT5_PATH,
        env: {
          ...process.env,
          WINEPREFIX: MT5_WINEPREFIX,
          WINEDEBUG: "-all",
        },
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout || "",
          stderr: stderr || "",
          exitCode: error ? (error as any).code ?? 1 : 0,
        });
      }
    );
  });
}
```

- [ ] **Step 2: Verify it builds**

```bash
npx tsc
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/utils/wine.ts
git commit -m "feat: add Wine execution utility"
```

---

### Task 4: Log Parser Utility

**Files:**
- Create: `src/utils/log-parser.ts`

- [ ] **Step 1: Create src/utils/log-parser.ts**

The MetaEditor per-file `.log` is UTF-16LE. The format is:
- `file(line,col) : error/warning code: message` for errors/warnings
- `file : information: message` for info lines
- `Result: N errors, N warnings` as final summary

```typescript
import { readFile } from "fs/promises";
import iconv from "iconv-lite";

export interface CompileMessage {
  file: string;
  line: number;
  column: number;
  type: "error" | "warning" | "information";
  code: number;
  message: string;
}

export interface CompileResult {
  success: boolean;
  errors: number;
  warnings: number;
  elapsed: string;
  messages: CompileMessage[];
}

export async function parseCompileLog(logPath: string): Promise<CompileResult> {
  const raw = await readFile(logPath);
  const text = iconv.decode(raw, "utf-16le");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  const messages: CompileMessage[] = [];
  let errors = 0;
  let warnings = 0;
  let elapsed = "";

  const msgPattern =
    /^(.+?)\((\d+),(\d+)\)\s*:\s*(error|warning)\s+(\d+):\s*(.+)$/;
  const resultPattern =
    /^Result:\s*(\d+)\s*errors?,\s*(\d+)\s*warnings?(?:,\s*(\d+\s*msec)\s*elapsed)?/;

  for (const line of lines) {
    const msgMatch = line.match(msgPattern);
    if (msgMatch) {
      messages.push({
        file: msgMatch[1].trim(),
        line: parseInt(msgMatch[2], 10),
        column: parseInt(msgMatch[3], 10),
        type: msgMatch[4] as "error" | "warning",
        code: parseInt(msgMatch[5], 10),
        message: msgMatch[6].trim(),
      });
      continue;
    }

    const resMatch = line.match(resultPattern);
    if (resMatch) {
      errors = parseInt(resMatch[1], 10);
      warnings = parseInt(resMatch[2], 10);
      elapsed = resMatch[3] || "";
    }
  }

  return {
    success: errors === 0,
    errors,
    warnings,
    elapsed,
    messages,
  };
}
```

- [ ] **Step 2: Verify it builds**

```bash
npx tsc
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/utils/log-parser.ts
git commit -m "feat: add UTF-16LE compile log parser"
```

---

### Task 5: File Tools (list, read, write)

**Files:**
- Create: `src/tools/files.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create src/tools/files.ts**

```typescript
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
```

- [ ] **Step 2: Update src/index.ts to register file tools**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { validateConfig } from "./config.js";
import { registerFileTools } from "./tools/files.js";

const server = new McpServer({
  name: "mcp-metaeditor",
  version: "0.1.0",
});

registerFileTools(server);

async function main() {
  validateConfig();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

- [ ] **Step 3: Verify it builds**

```bash
npx tsc
```

Expected: No errors. Note: `zod` comes bundled with `@modelcontextprotocol/sdk`, so no separate install needed. If `zod` is not found, run `npm install zod`.

- [ ] **Step 4: Commit**

```bash
git add src/tools/files.ts src/index.ts
git commit -m "feat: add file tools (list, read, write)"
```

---

### Task 6: Compile Tools

**Files:**
- Create: `src/tools/compile.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create src/tools/compile.ts**

```typescript
import { existsSync } from "fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runWine } from "../utils/wine.js";
import {
  resolveAndValidateMql5Path,
  toWindowsRelPath,
} from "../utils/paths.js";
import { parseCompileLog } from "../utils/log-parser.js";
import { METAEDITOR_EXE } from "../config.js";

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
      const result = await runWine(
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
```

- [ ] **Step 2: Update src/index.ts to register compile tools**

Add after `registerFileTools(server);`:

```typescript
import { registerCompileTools } from "./tools/compile.js";

registerCompileTools(server);
```

Full `src/index.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { validateConfig } from "./config.js";
import { registerFileTools } from "./tools/files.js";
import { registerCompileTools } from "./tools/compile.js";

const server = new McpServer({
  name: "mcp-metaeditor",
  version: "0.1.0",
});

registerFileTools(server);
registerCompileTools(server);

async function main() {
  validateConfig();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

- [ ] **Step 3: Verify it builds**

```bash
npx tsc
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/tools/compile.ts src/index.ts
git commit -m "feat: add compile tools (compile_mql5, get_compile_errors)"
```

---

### Task 7: Backtest Tools

**Files:**
- Create: `src/tools/backtest.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create src/tools/backtest.ts**

The Strategy Tester is controlled via `.ini` files. MT5 accepts `/config:file.ini` to run a backtest. The ini format:

```ini
[Tester]
Expert=Experts\MyEA
Symbol=Crash 900 Index
Period=M1
Deposit=10000
Leverage=100
FromDate=2026.01.01
ToDate=2026.03.01
Model=0
Optimization=0
ShutdownTerminal=1
```

After the test, results are saved in `<AppData>/Tester/<hash>/` or in the portable `Tester/` directory.

```typescript
import { writeFile, readdir, readFile, stat } from "fs/promises";
import { resolve, basename } from "path";
import { existsSync } from "fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runWine } from "../utils/wine.js";
import { resolveAndValidateMql5Path } from "../utils/paths.js";
import { MT5_PATH, TERMINAL_EXE } from "../config.js";

const PERIODS: Record<string, number> = {
  M1: 1,
  M5: 5,
  M15: 15,
  M30: 30,
  H1: 60,
  H4: 240,
  D1: 1440,
  W1: 10080,
  MN1: 43200,
};

function generateTesterIni(params: {
  expert: string;
  symbol: string;
  period: string;
  dateFrom: string;
  dateTo: string;
  deposit: number;
  leverage: string;
}): string {
  // Expert path should be without extension and use backslashes
  const expertPath = params.expert
    .replace(/\.mq[45]$/, "")
    .replace(/\.ex[45]$/, "")
    .replace(/\//g, "\\");

  // Leverage: extract number from "1:100" format
  const leverageNum = params.leverage.includes(":")
    ? params.leverage.split(":")[1]
    : params.leverage;

  return [
    "[Tester]",
    `Expert=${expertPath}`,
    `Symbol=${params.symbol}`,
    `Period=${PERIODS[params.period] || 1}`,
    `Deposit=${params.deposit}`,
    `Leverage=${leverageNum}`,
    `FromDate=${params.dateFrom}`,
    `ToDate=${params.dateTo}`,
    "Model=0",
    "Optimization=0",
    "ShutdownTerminal=1",
    "Visual=0",
    "",
  ].join("\r\n");
}

async function findLatestReport(testerDir: string): Promise<string | null> {
  const cacheDir = resolve(testerDir, "cache");
  if (!existsSync(cacheDir)) return null;

  const entries = await readdir(cacheDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());

  let latest: { path: string; mtime: number } | null = null;
  for (const dir of dirs) {
    const reportPath = resolve(cacheDir, dir.name);
    const htmlFiles = (await readdir(reportPath).catch(() => [])).filter((f) =>
      f.endsWith(".xml")
    );
    for (const f of htmlFiles) {
      const full = resolve(reportPath, f);
      const info = await stat(full);
      if (!latest || info.mtimeMs > latest.mtime) {
        latest = { path: full, mtime: info.mtimeMs };
      }
    }
  }

  return latest?.path || null;
}

async function pollForResults(
  testerDir: string,
  timeoutMs: number,
  startTime: number
): Promise<string | null> {
  const pollInterval = 5000;
  const deadline = startTime + timeoutMs;

  while (Date.now() < deadline) {
    const report = await findLatestReport(testerDir);
    if (report) {
      const info = await stat(report);
      if (info.mtimeMs > startTime) {
        return report;
      }
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  return null;
}

export function registerBacktestTools(server: McpServer): void {
  server.tool(
    "run_backtest",
    "Run a backtest using MT5 Strategy Tester. Generates a .ini config and launches terminal64.exe.",
    {
      expert: z
        .string()
        .describe(
          "Path to EA relative to MQL5/ (e.g. Experts/MyEA.mq5)"
        ),
      symbol: z.string().describe("Trading symbol (e.g. Crash 900 Index)"),
      period: z
        .enum(["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN1"])
        .describe("Timeframe"),
      date_from: z
        .string()
        .describe("Start date YYYY.MM.DD (e.g. 2026.01.01)"),
      date_to: z
        .string()
        .describe("End date YYYY.MM.DD (e.g. 2026.03.01)"),
      deposit: z.number().default(10000).describe("Initial deposit"),
      leverage: z.string().default("1:100").describe("Leverage (e.g. 1:100)"),
    },
    async ({ expert, symbol, period, date_from, date_to, deposit, leverage }) => {
      // Validate the EA exists (compiled .ex5)
      const mq5Path = resolveAndValidateMql5Path(expert);
      const ex5Path = mq5Path.replace(/\.mq[45]$/, ".ex5");
      if (!existsSync(ex5Path)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Compiled EA not found: ${ex5Path}. Compile the EA first with compile_mql5.`,
            },
          ],
          isError: true,
        };
      }

      const ini = generateTesterIni({
        expert,
        symbol,
        period,
        dateFrom: date_from,
        dateTo: date_to,
        deposit,
        leverage,
      });

      const iniPath = resolve(MT5_PATH, "tester_mcp.ini");
      await writeFile(iniPath, ini, "utf-8");

      const startTime = Date.now();

      // Launch terminal with config (fire and forget with long timeout)
      const result = await runWine(
        "terminal64.exe",
        ["/config:tester_mcp.ini", "/portable"],
        300000 // 5 min timeout
      );

      // Try to find results
      const testerDir = resolve(MT5_PATH, "Tester");
      const report = await findLatestReport(testerDir);

      if (report) {
        const info = await stat(report);
        if (info.mtimeMs > startTime) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Backtest completed. Report: ${report}\nUse get_backtest_results to read the results.`,
              },
            ],
          };
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Backtest launched. Terminal exited with code ${result.exitCode}.\nCheck Tester/ directory for results, or use get_backtest_results.`,
          },
        ],
      };
    }
  );

  server.tool(
    "get_backtest_results",
    "Read and parse the latest backtest results",
    {
      expert: z
        .string()
        .optional()
        .describe(
          "EA name to filter results (optional, returns latest if omitted)"
        ),
    },
    async ({ expert }) => {
      const testerDir = resolve(MT5_PATH, "Tester");
      if (!existsSync(testerDir)) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No Tester directory found. Run a backtest first.",
            },
          ],
          isError: true,
        };
      }

      const report = await findLatestReport(testerDir);
      if (!report) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No backtest reports found. Run a backtest first.",
            },
          ],
          isError: true,
        };
      }

      const content = await readFile(report, "utf-8");

      // Return raw content — XML reports can be large but structured
      return {
        content: [
          {
            type: "text" as const,
            text: `Report file: ${report}\n\n${content}`,
          },
        ],
      };
    }
  );
}
```

- [ ] **Step 2: Update src/index.ts to register backtest tools**

Full `src/index.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { validateConfig } from "./config.js";
import { registerFileTools } from "./tools/files.js";
import { registerCompileTools } from "./tools/compile.js";
import { registerBacktestTools } from "./tools/backtest.js";

const server = new McpServer({
  name: "mcp-metaeditor",
  version: "0.1.0",
});

registerFileTools(server);
registerCompileTools(server);
registerBacktestTools(server);

async function main() {
  validateConfig();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

- [ ] **Step 3: Verify it builds**

```bash
npx tsc
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/tools/backtest.ts src/index.ts
git commit -m "feat: add backtest tools (run_backtest, get_backtest_results)"
```

---

### Task 8: Build, Test End-to-End, and Register with Claude Code

**Files:**
- Modify: `package.json` (add bin field)

- [ ] **Step 1: Add bin field to package.json**

Add to `package.json`:

```json
{
  "bin": {
    "mcp-metaeditor": "dist/index.js"
  }
}
```

- [ ] **Step 2: Add shebang to src/index.ts**

Add as the very first line of `src/index.ts`:

```typescript
#!/usr/bin/env node
```

- [ ] **Step 3: Build the project**

```bash
cd /home/ctpn3m0/Documents/GitHub/mcp-metaeditor
npx tsc
```

Expected: No errors, all files in `dist/`.

- [ ] **Step 4: Test the MCP server starts**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.0.1"}}}' | node dist/index.js 2>/dev/null | head -1
```

Expected: JSON response with server capabilities listing all 7 tools.

- [ ] **Step 5: Create .env file with actual paths**

```bash
cp .env.example .env
```

Edit `.env` with the actual paths (they match the example defaults).

- [ ] **Step 6: Register MCP server with Claude Code**

```bash
claude mcp add mcp-metaeditor node /home/ctpn3m0/Documents/GitHub/mcp-metaeditor/dist/index.js
```

- [ ] **Step 7: Verify Claude Code sees the tools**

Start a new Claude Code session and verify the 7 tools appear:
- `list_mql5_files`
- `read_mql5_file`
- `write_mql5_file`
- `compile_mql5`
- `get_compile_errors`
- `run_backtest`
- `get_backtest_results`

- [ ] **Step 8: Commit**

```bash
git add package.json src/index.ts
git commit -m "feat: finalize MCP server with bin entry and shebang"
```

---

### Task 9: End-to-End Smoke Test

- [ ] **Step 1: Test list_mql5_files**

From Claude Code, ask: "list all expert advisors". Verify it returns the existing EAs in `MQL5/Experts/`.

- [ ] **Step 2: Test write + compile cycle**

From Claude Code, ask: "create a simple EA that prints Hello World on init, save it as Experts/HelloWorld.mq5, and compile it".

Verify:
- File created at `MQL5/Experts/HelloWorld.mq5`
- Compilation succeeds with 0 errors
- `HelloWorld.ex5` generated

- [ ] **Step 3: Test compile error handling**

From Claude Code, ask: "create an EA with intentional syntax errors and compile it".

Verify:
- Compilation fails
- Errors returned with line numbers and messages

- [ ] **Step 4: Clean up test files**

```bash
rm -f "$HOME/.mt5/drive_c/Program Files/MetaTrader 5/MQL5/Scripts/TestMCP.mq5"
rm -f "$HOME/.mt5/drive_c/Program Files/MetaTrader 5/MQL5/Scripts/TestMCP.ex5"
rm -f "$HOME/.mt5/drive_c/Program Files/MetaTrader 5/MQL5/Scripts/TestMCP.log"
rm -f "$HOME/.mt5/drive_c/Program Files/MetaTrader 5/MQL5/Scripts/TestError.mq5"
rm -f "$HOME/.mt5/drive_c/Program Files/MetaTrader 5/MQL5/Scripts/TestError.log"
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: clean up test files"
```

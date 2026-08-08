import { writeFile, readdir, readFile, stat } from "fs/promises";
import { resolve, basename } from "path";
import { existsSync } from "fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runExecutable } from "../utils/executor.js";
import { resolveAndValidateMql5Path } from "../utils/paths.js";
import { MT5_PATH } from "../config.js";

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
  const expertPath = params.expert
    .replace(/\.mq[45]$/, "")
    .replace(/\.ex[45]$/, "")
    .replace(/\//g, "\\");

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

      const result = await runExecutable(
        "terminal64.exe",
        ["/config:tester_mcp.ini", "/portable"],
        300000
      );

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

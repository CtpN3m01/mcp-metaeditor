# mcp-metaeditor

MCP server that connects Claude Code (or any MCP client) to the MetaTrader 5 MetaEditor toolchain on **Linux (via Wine)** and **Windows (native)**.

It lets you automate a full MQL5 workflow:
- browse MQL5 files,
- read/write code,
- compile EAs/indicators/scripts,
- run backtests and inspect results.

## Quick install (Claude Code)

1. Install dependencies:

```bash
npm install
```

2. Build the server:

```bash
npm run build
```

3. Register this MCP in Claude Code:

```bash
claude mcp add mcp-metaeditor node "$PWD/dist/index.js"
```

> Run this command from the project root directory.

4. Verify it is registered:

```bash
claude mcp list
```

5. Start a new Claude Code session and use tools like `list_mql5_files`.

## Requirements

### Linux
- Wine installed and working
- MetaTrader 5 installed inside your Wine prefix
- Node.js 20+
- npm

### Windows
- MetaTrader 5 installed natively
- Node.js 20+
- npm

## Configuration

### Linux
Set environment variables before running:

```bash
export MT5_WINEPREFIX="$HOME/.mt5"
export MT5_PATH="$HOME/.mt5/drive_c/Program Files/MetaTrader 5"
```

Default values:
- `MT5_WINEPREFIX`: `~/.mt5`
- `MT5_PATH`: `~/.mt5/drive_c/Program Files/MetaTrader 5`

### Windows
Set environment variables before running (optional - uses defaults):

```powershell
$env:MT5_PATH = "C:\Program Files\MetaTrader 5"
```

Default value:
- `MT5_PATH`: `C:\Program Files\MetaTrader 5`

### Validation
The server validates on startup that `MT5_PATH`, `MetaEditor64.exe`, and `MQL5` exist.

## Available MCP tools

### Files
- `list_mql5_files(type, pattern?)`
- `read_mql5_file(path)`
- `write_mql5_file(path, content)`

### Compile
- `compile_mql5(path)`
- `get_compile_errors(path)`

### Backtest
- `run_backtest(expert, symbol, period, date_from, date_to, deposit?, leverage?)`
- `get_backtest_results(expert?)`

## Recommended workflow

1. `write_mql5_file` to create/update your EA.
2. `compile_mql5` to compile.
3. `get_compile_errors` to inspect errors/warnings.
4. `run_backtest` to launch a test.
5. `get_backtest_results` to inspect output.

## npm scripts

- `npm run build` — compile TypeScript into `dist/`
- `npm start` — run `dist/index.js`
- `npm run dev` — watch mode TypeScript compilation

## License

MIT

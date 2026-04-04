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

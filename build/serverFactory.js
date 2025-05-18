// src/serverFactory.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// 👉 import all your tool definitions here (or call a function that registers them)
import { registerTools } from "./tools/tools.js";
export function getServer() {
    const server = new McpServer({ name: "news-stock", version: "1.0.0" });
    registerTools(server); // same code you used before
    return server;
}

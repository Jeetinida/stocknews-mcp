// src/index.ts
import 'dotenv/config';
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getServer } from "./serverFactory.js";
const app = express();
app.use(express.json());
// POST /mcp → new server + transport each call
app.post('/mcp', async (req, res) => {
    try {
        const server = getServer();
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });
        // Close server + transport when client drops the SSE connection
        res.on('close', () => {
            transport.close();
            server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    }
    catch (err) {
        console.error('MCP error:', err);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: { code: -32603, message: 'Internal server error' },
                id: null,
            });
        }
    }
});
// 405 for other verbs on /mcp
['get', 'delete', 'put'].forEach((method) => app[method]('/mcp', (_req, res) => {
    res.status(405).json({
        jsonrpc: '2.0',
        error: { code: -32601, message: 'Method not found' },
        id: null,
    });
}));
// Health & manifest routes (SDK provides helpers, but simple static OK is fine)
app.get('/.well-known/mcp/health', (_req, res) => {
    res.status(200).json({
        jsonrpc: '2.0',
        result: { status: 'ok' },
        id: null,
    });
});
const PORT = process.env.PORT ? Number(process.env.PORT) : 3333;
app.listen(PORT, () => console.log(`🚀 MCP SSE server listening on :${PORT}`));

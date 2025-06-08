// src/index.ts
import 'dotenv/config';
import express, { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getServer } from "./serverFactory.js";
import {
  JSONRPCError,
  InitializeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from 'crypto';

const SESSION_ID_HEADER_NAME = "mcp-session-id";

const app = express();
app.use(express.json());

// to support multiple simultaneous connections we have a lookup object from
// sessionId to transport
const transports: {[sessionId: string]: StreamableHTTPServerTransport} = {}

// POST /mcp → new server + transport each call
app.post('/mcp', async (req: Request, res: Response) => {
  try {
    const server = getServer();
    let transport: StreamableHTTPServerTransport;

    /// check if sessionId is provided in the request body
    const sessionId = req.headers[SESSION_ID_HEADER_NAME] as string || undefined;

    if (sessionId && transports[sessionId]) {
      // if transport already exists, reuse it
      console.log(`Reusing transport for sessionId: ${sessionId}`);
      transport = transports[sessionId];
      await transport.handleRequest(req, res, req.body);
      return;
    }

    console.log(`SessionId: ${sessionId}`);
    console.log("is initialize request:", isInitializeRequest(req.body));

    if (!sessionId && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });


      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      console.log(
        `Created new transport for sessionId: ${transport.sessionId}`,
      );
      // session ID will only be available (if in not Stateless-Mode)
      // after handling the first request
      const sessionId = transport.sessionId;
      console.log(`SessionId after handling request: ${sessionId}`);
      if (sessionId) {
        transports[sessionId] = transport;
      }
      
      return;
    }

    res
        .status(400)
        .json(
          createErrorResponse("Bad Request: invalid session ID or method.")
        );
      return;

  } catch (err) {
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
(['get', 'delete', 'put'] as const).forEach((method) =>
  app[method]('/mcp', (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32601, message: 'Method not found' },
      id: null,
    });
  }
  ),
);

// Health & manifest routes (SDK provides helpers, but simple static OK is fine)
app.get('/.well-known/mcp/health', (_req, res) => {
  res.status(200).json({
    jsonrpc: '2.0',
    result: { status: 'ok' },
    id: null,
  });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3333;
app.listen(PORT, () =>
  console.log(`🚀 MCP SSE server listening on :${PORT}`),
);


function createErrorResponse(message: string): JSONRPCError {
  return {
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: message,
    },
    id: randomUUID(),
  };
}

function isInitializeRequest(body: any): boolean {
  const isInitial = (data: any) => {
    const result = InitializeRequestSchema.safeParse(data);
    return result.success;
  };
  if (Array.isArray(body)) {
    return body.some((request) => isInitial(request));
  }
  return isInitial(body);
}

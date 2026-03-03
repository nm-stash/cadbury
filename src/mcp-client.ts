/**
 * MCP (Model Context Protocol) Client
 *
 * Implements the MCP Streamable HTTP transport (JSON-RPC 2.0).
 * Auto-detects response format: direct JSON or SSE stream.
 *
 * Protocol flow:
 *   1. POST initialize → server capabilities
 *   2. POST notifications/initialized (notification, no response)
 *   3. POST tools/list → available tools
 *   4. POST tools/call → execute a tool
 */

import { MCPDiscoveredTool } from "./types";

export interface MCPClientConfig {
  serverUrl: string;
  authHeaders?: Record<string, string>;
  timeoutMs?: number; // Default: 30000
  clientName?: string; // Default: "cadbury"
  clientVersion?: string; // Default: package version
}

export interface MCPServerInfo {
  protocolVersion: string;
  capabilities: Record<string, any>;
  serverInfo: { name: string; version?: string };
}

export interface MCPToolCallResult {
  content: Array<{
    type: string; // "text", "image", "resource"
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: Record<string, any>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

export class MCPClient {
  private serverUrl: string;
  private authHeaders: Record<string, string>;
  private timeoutMs: number;
  private clientName: string;
  private clientVersion: string;
  private sessionId?: string;
  private initialized = false;
  private requestId = 0;

  constructor(config: MCPClientConfig) {
    this.serverUrl = config.serverUrl;
    this.authHeaders = config.authHeaders || {};
    this.timeoutMs = config.timeoutMs || 30000;
    this.clientName = config.clientName || "cadbury";
    this.clientVersion = config.clientVersion || "1.1.0";
  }

  /**
   * Initialize the MCP session. Must be called before listTools/callTool.
   */
  async connect(): Promise<MCPServerInfo> {
    const result = await this.sendRequest("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {
        name: this.clientName,
        version: this.clientVersion,
      },
    });

    const serverInfo: MCPServerInfo = {
      protocolVersion: result.protocolVersion,
      capabilities: result.capabilities || {},
      serverInfo: result.serverInfo || { name: "unknown" },
    };

    // Send initialized notification (no id = notification, no response expected)
    await this.sendNotification("notifications/initialized", {});

    this.initialized = true;
    return serverInfo;
  }

  /**
   * List available tools from the MCP server.
   * Auto-connects if not already initialized.
   */
  async listTools(): Promise<MCPDiscoveredTool[]> {
    if (!this.initialized) {
      await this.connect();
    }

    const result = await this.sendRequest("tools/list", {});
    return (result.tools || []).map((tool: any) => ({
      name: tool.name,
      description: tool.description || "",
      inputSchema: tool.inputSchema || {},
    }));
  }

  /**
   * Call a tool on the MCP server.
   * Auto-connects if not already initialized.
   */
  async callTool(
    name: string,
    args: Record<string, any>
  ): Promise<MCPToolCallResult> {
    if (!this.initialized) {
      await this.connect();
    }

    const result = await this.sendRequest("tools/call", {
      name,
      arguments: args,
    });

    return {
      content: result.content || [],
      isError: result.isError || false,
    };
  }

  /**
   * Close the session (if the server supports it).
   */
  async close(): Promise<void> {
    if (this.sessionId) {
      try {
        await fetch(this.serverUrl, {
          method: "DELETE",
          headers: this.buildHeaders(),
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // Best-effort close
      }
    }
    this.initialized = false;
    this.sessionId = undefined;
  }

  /**
   * Send a JSON-RPC request and parse the response.
   * Handles both direct JSON and SSE response formats.
   */
  private async sendRequest(
    method: string,
    params?: Record<string, any>
  ): Promise<any> {
    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    const response = await fetch(this.serverUrl, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    // Capture session ID if provided
    const newSessionId = response.headers.get("mcp-session-id");
    if (newSessionId) {
      this.sessionId = newSessionId;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `MCP request "${method}" failed (${response.status}): ${errorText}`
      );
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/event-stream")) {
      return this.parseSSEResponse(response, id);
    }

    // Direct JSON response
    const jsonResponse: JsonRpcResponse = await response.json();

    if (jsonResponse.error) {
      throw new Error(
        `MCP error (${jsonResponse.error.code}): ${jsonResponse.error.message}`
      );
    }

    return jsonResponse.result;
  }

  /**
   * Send a JSON-RPC notification (no id, no response expected).
   */
  private async sendNotification(
    method: string,
    params?: Record<string, any>
  ): Promise<void> {
    const notification: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      params,
    };

    const response = await fetch(this.serverUrl, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(notification),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    // Capture session ID
    const newSessionId = response.headers.get("mcp-session-id");
    if (newSessionId) {
      this.sessionId = newSessionId;
    }

    // Notifications may return 202 Accepted or 204 No Content
    if (!response.ok && response.status !== 202 && response.status !== 204) {
      const errorText = await response.text();
      throw new Error(
        `MCP notification "${method}" failed (${response.status}): ${errorText}`
      );
    }
  }

  /**
   * Parse an SSE (text/event-stream) response and extract the JSON-RPC message
   * that matches our request ID.
   */
  private async parseSSEResponse(
    response: Response,
    expectedId: number
  ): Promise<any> {
    const body = response.body;
    if (!body) {
      throw new Error("SSE response has no body");
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events (separated by double newline)
        const events = buffer.split("\n\n");
        buffer = events.pop() || ""; // Keep incomplete event in buffer

        for (const event of events) {
          const parsed = this.parseSSEEvent(event);
          if (!parsed) continue;

          // Check if this is our response
          const jsonRpc: JsonRpcResponse = parsed;

          if (jsonRpc.id === expectedId) {
            reader.cancel();

            if (jsonRpc.error) {
              throw new Error(
                `MCP error (${jsonRpc.error.code}): ${jsonRpc.error.message}`
              );
            }

            return jsonRpc.result;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    throw new Error(
      `SSE stream ended without response for request ${expectedId}`
    );
  }

  /**
   * Parse a single SSE event block into a JSON object.
   */
  private parseSSEEvent(eventBlock: string): any | null {
    let data = "";
    let eventType = "message";

    for (const line of eventBlock.split("\n")) {
      if (line.startsWith("data: ")) {
        data += line.slice(6);
      } else if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      }
      // Ignore id:, retry:, and comment lines
    }

    if (!data || eventType === "ping") {
      return null;
    }

    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...this.authHeaders,
    };

    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    return headers;
  }
}

import puppeteer from "puppeteer";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { createEmbeddings, processPDFWithEmbeddings } from "./pdf-processor";
import { createWebAutomationTool } from "./web-automation";
import { WebAutomationConfig, MCPToolConfig, MCPDiscoveredTool } from "./types";

/**
 * Creates a free web search tool using Google via Puppeteer.
 * No API key required - scrapes Google search results directly.
 */
export const createWebSearchTool = () =>
  new DynamicStructuredTool({
    name: "web_search",
    description:
      "Search the web using Google. Returns top search results with titles, URLs, and snippets.",
    schema: z.object({
      query: z.string().describe("The search query"),
      maxResults: z
        .number()
        .optional()
        .default(5)
        .describe("Maximum number of results to return (default: 5)"),
    }) as any,
    func: async ({
      query,
      maxResults = 5,
    }: {
      query: string;
      maxResults?: number;
    }): Promise<string> => {
      let browser;
      try {
        browser = await puppeteer.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        const page = await browser.newPage();
        await page.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );

        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });

        // Extract search results
        const results = await page.evaluate((max: number) => {
          const items: Array<{ title: string; url: string; snippet: string }> = [];
          const searchResults = document.querySelectorAll("div.g");

          searchResults.forEach((result, index) => {
            if (index >= max) return;

            const titleEl = result.querySelector("h3");
            const linkEl = result.querySelector("a");
            const snippetEl = result.querySelector("div[data-sncf]") ||
              result.querySelector(".VwiC3b") ||
              result.querySelector("span.aCOpRe");

            if (titleEl && linkEl) {
              items.push({
                title: titleEl.textContent || "",
                url: linkEl.getAttribute("href") || "",
                snippet: snippetEl?.textContent || "",
              });
            }
          });

          return items;
        }, maxResults);

        await browser.close();

        if (results.length === 0) {
          return "No search results found.";
        }

        return results
          .map(
            (r, i) =>
              `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`
          )
          .join("\n\n");
      } catch (error: any) {
        if (browser) await browser.close();
        return `Search error: ${error.message}`;
      }
    },
  });

/**
 * @deprecated Use createWebSearchTool instead. Tavily requires a paid API key.
 */
export const createTavilyTool = (_apiKey?: string) => {
  console.warn(
    "createTavilyTool is deprecated. Use createWebSearchTool() instead - it's free and uses Google."
  );
  return createWebSearchTool();
};

// Additional utility tools for Cadbury
export const createTextAnalysisTool = () =>
  new DynamicStructuredTool({
    name: "analyze_text",
    description: "Analyze text for sentiment, key topics, or summary",
    schema: z.object({
      text: z.string(),
      analysisType: z.enum(["sentiment", "topics", "summary"]),
    }) as any,
    func: async ({ text, analysisType }: { text: string; analysisType: string }) => {
      // This is a placeholder - in a real implementation, you might use
      // a dedicated text analysis service or model
      switch (analysisType) {
        case "sentiment":
          return `Sentiment analysis of the provided text: The text appears to have a neutral to positive sentiment.`;
        case "topics":
          return `Key topics identified: ${text
            .split(" ")
            .slice(0, 5)
            .join(", ")}...`;
        case "summary":
          return `Summary: ${text.substring(0, 100)}...`;
        default:
          return "Analysis completed.";
      }
    },
  });

export const createCalculatorTool = () =>
  new DynamicStructuredTool({
    name: "calculate",
    description:
      "Perform simple mathematical calculations (basic arithmetic operations)",
    schema: z.object({
      expression: z
        .string()
        .describe(
          "Mathematical expression with basic operators (+, -, *, /, %, parentheses)"
        ),
    }) as any,
    func: async ({ expression }: { expression: string }) => {
      try {
        // Simple safe evaluation for basic math operations
        // Only allow numbers, operators, parentheses, and whitespace
        const safeExpression = expression.replace(/[^0-9+\-*/().\s%]/g, "");

        if (!safeExpression || safeExpression !== expression) {
          return "Error: Only basic mathematical operations are supported (+, -, *, /, %, parentheses)";
        }

        // Use Function constructor for safe evaluation of simple math
        const result = Function(
          '"use strict"; return (' + safeExpression + ")"
        )();

        if (typeof result !== "number" || !isFinite(result)) {
          return "Error: Invalid mathematical expression";
        }

        return `Calculation result: ${result}`;
      } catch (error) {
        return `Error in calculation: Invalid expression`;
      }
    },
  });

export const createEmbeddingTool = (apiKey: string) =>
  new DynamicStructuredTool({
    name: "create_embeddings",
    description: "Generate embeddings for text using OpenAI's embedding models",
    schema: z.object({
      text: z.string().describe("The text to generate embeddings for"),
      model: z
        .string()
        .optional()
        .describe(
          "The embedding model to use (default: text-embedding-3-small)"
        ),
      dimensions: z
        .number()
        .optional()
        .describe("Optional dimension reduction"),
    }) as any,
    func: async ({ text, model, dimensions }: { text: string; model?: string; dimensions?: number }) => {
      try {
        const result = await createEmbeddings(text, apiKey, {
          model,
          dimensions,
        });
        return `Generated embeddings with ${
          result.dimensions
        } dimensions. Cost: $${result.cost.estimatedCost.toFixed(6)}`;
      } catch (error) {
        return `Error generating embeddings: ${error}`;
      }
    },
  });

export const createPDFProcessingTool = (apiKey: string) =>
  new DynamicStructuredTool({
    name: "process_pdf",
    description:
      "Extract text from PDF, create chunks, and generate embeddings",
    schema: z.object({
      pdfPath: z.string().describe("Path to the PDF file to process"),
      chunkSize: z
        .number()
        .optional()
        .describe("Size of text chunks (default: 1000 characters)"),
      overlap: z
        .number()
        .optional()
        .describe("Overlap between chunks (default: 200 characters)"),
      embeddingModel: z
        .string()
        .optional()
        .describe("Embedding model to use (default: text-embedding-3-small)"),
      embeddingDimensions: z
        .number()
        .optional()
        .describe("Optional dimension reduction"),
    }) as any,
    func: async ({
      pdfPath,
      chunkSize,
      overlap,
      embeddingModel,
      embeddingDimensions,
    }: {
      pdfPath: string;
      chunkSize?: number;
      overlap?: number;
      embeddingModel?: string;
      embeddingDimensions?: number;
    }) => {
      try {
        const result = await processPDFWithEmbeddings(pdfPath, apiKey, {
          chunkSize,
          overlap,
          embeddingModel,
          embeddingDimensions,
        });

        return `Processed PDF: ${result.metadata.totalPages} pages, ${
          result.metadata.totalChunks
        } chunks created with embeddings. Total cost: $${result.totalCost.estimatedCost.toFixed(
          6
        )}`;
      } catch (error) {
        return `Error processing PDF: ${error}`;
      }
    },
  });

// Web automation tool factory
export const createWebTool = (config: WebAutomationConfig = {}) => {
  return createWebAutomationTool(config);
};

/**
 * Creates a LangChain tool that calls an MCP (Model Context Protocol) server endpoint.
 * Follows MCP spec: POST {serverUrl}/tools/call with { name, arguments }
 */
export const createMCPClientTool = (config: MCPToolConfig) =>
  new DynamicStructuredTool({
    name: config.toolName,
    description: config.description,
    schema: config.inputSchema,
    func: async (input: any) => {
      try {
        const response = await fetch(`${config.serverUrl}/tools/call`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.authHeaders || {}),
          },
          body: JSON.stringify({ name: config.toolName, arguments: input }),
          signal: AbortSignal.timeout(config.timeoutMs || 30000),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return `MCP tool error (${response.status}): ${errorText}`;
        }

        const result = await response.json();
        return typeof result === "string" ? result : JSON.stringify(result);
      } catch (error: any) {
        if (error.name === "TimeoutError" || error.name === "AbortError") {
          return `MCP tool call timed out after ${config.timeoutMs || 30000}ms`;
        }
        return `MCP tool call failed: ${error.message}`;
      }
    },
  });

/**
 * Discover available tools from an MCP server.
 * Calls GET {serverUrl}/tools/list per MCP spec.
 * @returns Array of discovered tool definitions
 */
export async function discoverMCPTools(
  serverUrl: string,
  authHeaders?: Record<string, string>
): Promise<MCPDiscoveredTool[]> {
  const response = await fetch(`${serverUrl}/tools/list`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(authHeaders || {}),
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(
      `MCP tool discovery failed (${response.status}): ${await response.text()}`
    );
  }

  const body = await response.json();
  return body.tools || [];
}

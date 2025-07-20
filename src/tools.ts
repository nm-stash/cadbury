import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { DynamicStructuredTool } from "langchain/tools";
import { z } from "zod";
import { createEmbeddings, processPDFWithEmbeddings } from "./pdf-processor";
import { createWebAutomationTool } from "./web-automation";
import { WebAutomationConfig } from "./types";

export const createTavilyTool = (apiKey?: string) => {
  if (!apiKey) {
    throw new Error("Tavily API key is required for search functionality");
  }
  return new TavilySearchResults({
    apiKey: apiKey,
  });
};

// Additional utility tools for Cadbury
export const createTextAnalysisTool = () =>
  new DynamicStructuredTool({
    name: "analyze_text",
    description: "Analyze text for sentiment, key topics, or summary",
    schema: z.object({
      text: z.string(),
      analysisType: z.enum(["sentiment", "topics", "summary"]),
    }),
    func: async ({ text, analysisType }) => {
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
    description: "Perform mathematical calculations",
    schema: z.object({
      expression: z.string(),
    }),
    func: async ({ expression }) => {
      try {
        // Simple evaluation - in production, use a proper math parser
        const result = Function('"use strict"; return (' + expression + ")")();
        return `Calculation result: ${result}`;
      } catch (error) {
        return `Error in calculation: ${error}`;
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
    }),
    func: async ({ text, model, dimensions }) => {
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
    }),
    func: async ({
      pdfPath,
      chunkSize,
      overlap,
      embeddingModel,
      embeddingDimensions,
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

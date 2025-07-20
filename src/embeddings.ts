import { OpenAIEmbeddings } from "@langchain/openai";
import { EmbeddingResult, EmbeddingOptions, CostInfo } from "./types";

// OpenAI embedding pricing (per 1M tokens)
const EMBEDDING_PRICING = {
  "text-embedding-3-small": 0.02, // $0.02 per 1M tokens
  "text-embedding-3-large": 0.13, // $0.13 per 1M tokens
  "text-embedding-ada-002": 0.1, // $0.10 per 1M tokens
};

/**
 * Creates embeddings for the given text using OpenAI's embedding models
 * @param text The text to generate embeddings for
 * @param apiKey OpenAI API key
 * @param options Optional embedding configuration
 * @returns Promise that resolves to EmbeddingResult containing embeddings and cost
 */
export async function createEmbeddings(
  text: string,
  apiKey: string,
  options: EmbeddingOptions = {}
): Promise<EmbeddingResult> {
  const { model = "text-embedding-3-small", dimensions } = options;

  // Initialize OpenAI embeddings
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: apiKey,
    modelName: model,
    dimensions: dimensions,
  });

  try {
    // Generate embeddings
    const embeddingVector = await embeddings.embedQuery(text);

    // Calculate cost
    const estimatedTokens = estimateTokensForEmbeddings(text);
    const cost = calculateEmbeddingCost(estimatedTokens, model);

    return {
      embeddings: embeddingVector,
      cost,
      dimensions: embeddingVector.length,
    };
  } catch (error) {
    throw new Error(`Failed to generate embeddings: ${error}`);
  }
}

/**
 * Estimates the number of tokens for embedding generation
 * @param text The input text
 * @returns Estimated token count
 */
function estimateTokensForEmbeddings(text: string): number {
  // Rough estimation: ~4 characters per token for English text
  // This is an approximation - for exact counts, you'd need to use the tiktoken library
  return Math.ceil(text.length / 4);
}

/**
 * Calculates the cost of generating embeddings
 * @param tokens Number of tokens
 * @param model The embedding model used
 * @returns Cost information
 */
function calculateEmbeddingCost(tokens: number, model: string): CostInfo {
  const pricing =
    EMBEDDING_PRICING[model as keyof typeof EMBEDDING_PRICING] ||
    EMBEDDING_PRICING["text-embedding-3-small"];
  const estimatedCost = (tokens / 1_000_000) * pricing;

  return {
    inputTokens: tokens,
    outputTokens: 0, // Embeddings don't generate output tokens
    totalTokens: tokens,
    estimatedCost,
    model,
  };
}

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { CostTracker } from "./cost-tracker";
import {
  TextChunk,
  CostInfo,
  RAGOptions,
  RAGResult,
  GuardRails,
} from "./types";

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB) {
    throw new Error("Both vectors must be defined and non-null");
  }

  if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
    throw new Error("Both vectors must be arrays");
  }

  if (vecA.length !== vecB.length) {
    throw new Error(
      `Vectors must have the same length. Got ${vecA.length} and ${vecB.length}`
    );
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find the most relevant chunks based on query embeddings
 */
export function findRelevantChunks(
  queryEmbedding: number[],
  chunks: TextChunk[],
  options: { topK?: number; similarityThreshold?: number } = {}
): TextChunk[] {
  const { topK = 5, similarityThreshold = 0.5 } = options;

  // Validate chunks
  const validChunks = chunks.filter((chunk, index) => {
    if (!chunk.embeddings) {
      console.warn(`Chunk at index ${index} has no embeddings:`, chunk);
      return false;
    }
    if (!Array.isArray(chunk.embeddings)) {
      console.warn(
        `Chunk at index ${index} has non-array embeddings:`,
        typeof chunk.embeddings
      );
      return false;
    }
    if (chunk.embeddings.length === 0) {
      console.warn(`Chunk at index ${index} has empty embeddings array`);
      return false;
    }
    return true;
  });

  if (validChunks.length === 0) {
    console.warn(
      "No valid chunks with embeddings found, returning empty array"
    );
    return [];
  }

  // Calculate similarities and sort
  const chunksWithSimilarity = validChunks.map((chunk) => ({
    ...chunk,
    similarity: cosineSimilarity(queryEmbedding, chunk.embeddings),
  }));

  // Filter by threshold and sort by similarity
  const relevantChunks = chunksWithSimilarity
    .filter((chunk) => chunk.similarity >= similarityThreshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return relevantChunks;
}

/**
 * Query against embeddings using RAG (Retrieval-Augmented Generation)
 */
export async function queryWithEmbeddings(
  query: string,
  queryEmbedding: number[],
  chunks: TextChunk[],
  apiKey: string,
  options: RAGOptions = {},
  guardRails: GuardRails = {}
): Promise<RAGResult> {
  const {
    model = "gpt-3.5-turbo",
    temperature = 0,
    maxTokens = 1000,
    topK = 5,
    similarityThreshold = 0.5,
  } = options;

  const {
    allowedTopics = [],
    forbiddenTopics = [],
    maxResponseLength = 2000,
    requireCitation = true,
    customGuardPrompt,
  } = guardRails;

  // Find relevant chunks
  const relevantChunks = findRelevantChunks(queryEmbedding, chunks, {
    topK,
    similarityThreshold,
  });

  // Build context from relevant chunks if any are found
  let context = "";
  let hasRelevantChunks = relevantChunks.length > 0;

  if (hasRelevantChunks) {
    context = relevantChunks
      .map((chunk, index) => `[Source ${index + 1}]: ${chunk.text}`)
      .join("\n\n");
  }

  // Create guard rails prompt
  let guardPrompt = "";
  if (customGuardPrompt) {
    guardPrompt = customGuardPrompt;
  } else {
    const guards = [];
    if (allowedTopics.length > 0) {
      guards.push(`Only answer questions about: ${allowedTopics.join(", ")}`);
    }
    if (forbiddenTopics.length > 0) {
      guards.push(
        `Do not answer questions about: ${forbiddenTopics.join(", ")}`
      );
    }
    if (requireCitation && hasRelevantChunks) {
      guards.push("Always cite your sources using [Source X] format");
    }
    if (maxResponseLength) {
      guards.push(`Keep responses under ${maxResponseLength} characters`);
    }

    if (guards.length > 0) {
      guardPrompt = `Important guidelines:\n${guards.join("\n")}\n\n`;
    }
  }

  // Create system prompt
  let systemPrompt = "";
  if (hasRelevantChunks) {
    systemPrompt = `You are a helpful AI assistant that answers questions based on provided context. 
${guardPrompt}Use only the information provided in the context to answer questions. If the context doesn't contain enough information to answer a question, say so clearly.

Context:
${context}`;
  } else {
    // No relevant chunks found, allow AI to answer based on its knowledge
    systemPrompt = `You are a helpful AI assistant. 
${guardPrompt}No relevant context was found for this specific query, so please answer based on your general knowledge. Be clear that you're providing a general answer and not information from specific sources.`;
  }

  // Initialize LLM and cost tracker
  const llm = new ChatOpenAI({
    apiKey,
    modelName: model,
    temperature,
    maxTokens,
  });

  const costTracker = new CostTracker(model);

  try {
    // Create messages
    const messages = [new SystemMessage(systemPrompt), new HumanMessage(query)];

    // Get response
    const response = await llm.invoke(messages);
    const answer = response.content as string;

    // Estimate token usage
    const inputTokens = CostTracker.estimateTokens(systemPrompt + query);
    const outputTokens = CostTracker.estimateTokens(answer);
    const cost = costTracker.trackTokens(inputTokens, outputTokens);

    // Extract sources mentioned in the answer
    const sources: string[] = [];
    if (hasRelevantChunks) {
      const sourceMatches = answer.match(/\[Source \d+\]/g);
      if (sourceMatches) {
        sourceMatches.forEach((match) => {
          const sourceNum = parseInt(match.match(/\d+/)?.[0] || "0");
          if (sourceNum > 0 && sourceNum <= relevantChunks.length) {
            const chunk = relevantChunks[sourceNum - 1];
            if (chunk.metadata?.pageNumber) {
              sources.push(`Page ${chunk.metadata.pageNumber}`);
            } else {
              sources.push(`Chunk ${chunk.metadata?.chunkIndex || sourceNum}`);
            }
          }
        });
      }
    }

    return {
      answer,
      relevantChunks,
      cost,
      sources: [...new Set(sources)], // Remove duplicates
    };
  } catch (error) {
    throw new Error(`Failed to query with embeddings: ${error}`);
  }
}

/**
 * Create a simple RAG system that handles embedding generation and querying
 */
export class SimpleRAG {
  private chunks: TextChunk[] = [];
  private apiKey: string;
  private options: RAGOptions;
  private guardRails: GuardRails;

  constructor(
    apiKey: string,
    options: RAGOptions = {},
    guardRails: GuardRails = {}
  ) {
    this.apiKey = apiKey;
    this.options = options;
    this.guardRails = guardRails;
  }

  /**
   * Add chunks to the RAG system
   */
  addChunks(chunks: TextChunk[]): void {
    this.chunks.push(...chunks);
  }

  /**
   * Clear all chunks
   */
  clearChunks(): void {
    this.chunks = [];
  }

  /**
   * Get current chunks
   */
  getChunks(): TextChunk[] {
    return this.chunks;
  }

  /**
   * Query the RAG system
   */
  async query(query: string, queryEmbedding: number[]): Promise<RAGResult> {
    // Allow querying even with no chunks - the system will handle it gracefully
    return queryWithEmbeddings(
      query,
      queryEmbedding,
      this.chunks,
      this.apiKey,
      this.options,
      this.guardRails
    );
  }

  /**
   * Update guard rails
   */
  updateGuardRails(guardRails: GuardRails): void {
    this.guardRails = { ...this.guardRails, ...guardRails };
  }

  /**
   * Update RAG options
   */
  updateOptions(options: RAGOptions): void {
    this.options = { ...this.options, ...options };
  }
}

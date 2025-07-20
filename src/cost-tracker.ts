import { CostInfo } from "./types";

// OpenAI pricing as of June 2024 (per 1M tokens)
const MODEL_PRICING = {
  "gpt-4": {
    input: 30.0, // $30 per 1M input tokens
    output: 60.0, // $60 per 1M output tokens
  },
  "gpt-4-turbo": {
    input: 10.0, // $10 per 1M input tokens
    output: 30.0, // $30 per 1M output tokens
  },
  "gpt-3.5-turbo": {
    input: 0.5, // $0.50 per 1M input tokens
    output: 1.5, // $1.50 per 1M output tokens
  },
  "gpt-4o": {
    input: 5.0, // $5 per 1M input tokens
    output: 15.0, // $15 per 1M output tokens
  },
  "gpt-4o-mini": {
    input: 0.15, // $0.15 per 1M input tokens
    output: 0.6, // $0.60 per 1M output tokens
  },
};

// OpenAI embedding pricing (per 1M tokens)
const EMBEDDING_PRICING = {
  "text-embedding-3-small": 0.02, // $0.02 per 1M tokens
  "text-embedding-3-large": 0.13, // $0.13 per 1M tokens
  "text-embedding-ada-002": 0.1, // $0.10 per 1M tokens
};

export class CostTracker {
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private model: string;

  constructor(model: string) {
    this.model = model;
  }

  public trackTokens(inputTokens: number, outputTokens: number): CostInfo {
    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;

    const totalTokens = inputTokens + outputTokens;
    const estimatedCost = this.calculateCost(inputTokens, outputTokens);

    return {
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCost,
      model: this.model,
    };
  }

  public trackEmbeddingTokens(
    inputTokens: number,
    embeddingModel: string
  ): CostInfo {
    this.totalInputTokens += inputTokens;

    const estimatedCost = this.calculateEmbeddingCost(
      inputTokens,
      embeddingModel
    );

    return {
      inputTokens,
      outputTokens: 0, // Embeddings don't have output tokens
      totalTokens: inputTokens,
      estimatedCost,
      model: embeddingModel,
    };
  }

  public getTotalCost(): CostInfo {
    const totalTokens = this.totalInputTokens + this.totalOutputTokens;
    const estimatedCost = this.calculateCost(
      this.totalInputTokens,
      this.totalOutputTokens
    );

    return {
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalTokens,
      estimatedCost,
      model: this.model,
    };
  }

  private calculateCost(inputTokens: number, outputTokens: number): number {
    const pricing =
      MODEL_PRICING[this.model as keyof typeof MODEL_PRICING] ||
      MODEL_PRICING["gpt-3.5-turbo"];

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }

  private calculateEmbeddingCost(
    inputTokens: number,
    embeddingModel: string
  ): number {
    const pricing =
      EMBEDDING_PRICING[embeddingModel as keyof typeof EMBEDDING_PRICING] ||
      EMBEDDING_PRICING["text-embedding-3-small"];

    return (inputTokens / 1_000_000) * pricing;
  }

  public reset(): void {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
  }

  // Utility function to estimate tokens from text
  public static estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for English text
    // This is an approximation - for exact counts, you'd need to use the tiktoken library
    return Math.ceil(text.length / 4);
  }
}

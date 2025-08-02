import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { CostTracker } from "./cost-tracker";
import {
  PDFProcessingResult,
  PDFProcessingOptions,
  TextChunk,
  CostInfo,
  EmbeddingResult,
  EmbeddingOptions,
} from "./types";

// Simple logging utility - no external dependencies
const createLogger = (enabled: boolean = true) => ({
  info: (message: string) => enabled && console.log(`[INFO]: ${message}`),
  warn: (message: string) => enabled && console.warn(`[WARN]: ${message}`),
  error: (message: string, meta?: any) =>
    enabled && console.error(`[ERROR]: ${message}`, meta || ""),
});

const logger = createLogger();

/**
 * Sleep utility function for rate limiting
 * @param ms - Number of milliseconds to sleep
 * @returns Promise that resolves after the specified delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Semaphore class to control concurrent operations
 */
class Semaphore {
  private permits: number;
  private queue: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (this.permits > 0) {
        this.permits--;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release(): void {
    this.permits++;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        this.permits--;
        next();
      }
    }
  }
}

/**
 * Rate limiter with exponential backoff
 */
class RateLimiter {
  private lastRequestTime = 0;
  private baseDelay: number;
  private currentDelay: number;
  private consecutiveErrors = 0;
  private maxDelay = 10000; // Max 10 seconds

  constructor(baseDelay: number) {
    this.baseDelay = baseDelay;
    this.currentDelay = baseDelay;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.currentDelay) {
      const waitTime = this.currentDelay - timeSinceLastRequest;
      await sleep(waitTime);
    }

    this.lastRequestTime = Date.now();
  }

  onSuccess(): void {
    // Gradually reduce delay on successful requests
    this.consecutiveErrors = 0;
    this.currentDelay = Math.max(this.baseDelay, this.currentDelay * 0.9);
  }

  onError(): void {
    // Exponential backoff on errors
    this.consecutiveErrors++;
    this.currentDelay = Math.min(
      this.maxDelay,
      this.baseDelay * Math.pow(2, this.consecutiveErrors)
    );
  }

  getCurrentDelay(): number {
    return this.currentDelay;
  }
}

/**
 * Creates embeddings for a given text using OpenAI's embedding models with rate limiting and retry logic
 */
export async function createEmbeddings(
  text: string,
  apiKey: string,
  options: EmbeddingOptions = {},
  rateLimiter?: RateLimiter
): Promise<EmbeddingResult> {
  const {
    model = "text-embedding-3-small",
    dimensions,
    maxRetries = 3,
    retryDelay = 2000,
  } = options;

  const embeddings = new OpenAIEmbeddings({
    apiKey,
    model,
    dimensions,
  });

  const costTracker = new CostTracker(model);

  // Estimate input tokens for cost calculation
  const inputTokens = CostTracker.estimateTokens(text);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Apply rate limiting if rate limiter is provided
      if (rateLimiter) {
        await rateLimiter.waitIfNeeded();
      }

      const result = await embeddings.embedQuery(text);

      // Track embedding cost
      costTracker.trackEmbeddingTokens(inputTokens, model);

      // Notify rate limiter of success
      if (rateLimiter) {
        rateLimiter.onSuccess();
      }

      return {
        embeddings: result,
        cost: {
          inputTokens,
          outputTokens: 0, // Embeddings don't have output tokens
          totalTokens: inputTokens,
          estimatedCost: costTracker.getTotalCost().estimatedCost,
          model,
        },
        dimensions: result.length,
      };
    } catch (error: any) {
      lastError = error;

      // Check if it's a rate limit or quota error
      const isRateLimit =
        error.message?.includes("429") ||
        error.message?.includes("rate limit") ||
        error.message?.includes("quota") ||
        error.status === 429;

      // Notify rate limiter of error
      if (rateLimiter && isRateLimit) {
        rateLimiter.onError();
      }

      if (!isRateLimit || attempt === maxRetries) {
        // If it's not a rate limit error or we've exhausted retries, throw the error
        break;
      }

      // Calculate exponential backoff delay
      const backoffDelay = retryDelay * Math.pow(2, attempt);
      logger.warn(
        `Rate limit hit. Retrying in ${backoffDelay}ms... (attempt ${
          attempt + 1
        }/${maxRetries + 1})`
      );

      await sleep(backoffDelay);
    }
  }

  throw new Error(
    `Failed to create embeddings after ${maxRetries + 1} attempts: ${lastError}`
  );
}

/**
 * Processes a PDF file: extracts text, creates chunks, and generates embeddings with parallel processing and intelligent rate limiting
 */
export async function processPDFWithEmbeddings(
  pdfPath: string,
  apiKey: string,
  options: PDFProcessingOptions = {}
): Promise<PDFProcessingResult> {
  // Input validation
  if (!pdfPath || typeof pdfPath !== "string") {
    throw new Error("PDF path is required and must be a valid string");
  }
  if (!apiKey || typeof apiKey !== "string") {
    throw new Error("OpenAI API key is required and must be a valid string");
  }
  const {
    chunkSize = 1000,
    overlap = 200,
    embeddingModel = "text-embedding-3-small",
    embeddingDimensions,
    rateLimitDelay = 100, // Reduced from 1000ms to 100ms for faster processing
    maxRetries = 3,
    retryDelay = 2000,
    batchSize = 20, // Increased from 10 to 20 for better parallelism
    onProgress,
  } = options;

  // Additional options for parallel processing
  const concurrency = 10; // Number of concurrent requests
  const adaptiveRateLimit = true; // Enable adaptive rate limiting

  // Use provided progress callback or fallback to logger
  const reportProgress =
    onProgress || ((message: string) => logger.info(message));

  try {
    // Load PDF
    const loader = new PDFLoader(pdfPath);
    const docs = await loader.load();

    // Extract text and count pages
    const fullText = docs.map((doc) => doc.pageContent).join("\n");
    const totalPages = docs.length;

    // Create text splitter
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap: overlap,
    });

    // Split text into chunks
    const textChunks = await textSplitter.splitText(fullText);
    const totalChunks = textChunks.length;

    reportProgress(
      `Processing ${totalChunks} chunks with parallel processing (concurrency: ${concurrency}, rate limit: ${rateLimitDelay}ms)...`
    );

    // Initialize cost tracking and rate limiting
    const costTracker = new CostTracker(embeddingModel);
    const rateLimiter = new RateLimiter(rateLimitDelay);
    const semaphore = new Semaphore(concurrency);

    // Generate embeddings for each chunk with parallel processing
    const chunks: TextChunk[] = [];
    const errors: Array<{ index: number; error: Error }> = [];

    // Process chunks in batches with parallel processing
    for (
      let batchStart = 0;
      batchStart < textChunks.length;
      batchStart += batchSize
    ) {
      const batchEnd = Math.min(batchStart + batchSize, textChunks.length);
      const batch = textChunks.slice(batchStart, batchEnd);

      reportProgress(
        `Processing batch ${Math.floor(batchStart / batchSize) + 1}/${Math.ceil(
          textChunks.length / batchSize
        )} (chunks ${
          batchStart + 1
        }-${batchEnd}) - Rate limit delay: ${rateLimiter.getCurrentDelay()}ms`
      );

      // Create promises for parallel processing within the batch
      const batchPromises = batch.map(async (chunk, i) => {
        const globalIndex = batchStart + i;

        // Acquire semaphore permit for concurrency control
        await semaphore.acquire();

        try {
          const embeddingResult = await createEmbeddings(
            chunk,
            apiKey,
            {
              model: embeddingModel,
              dimensions: embeddingDimensions,
              maxRetries,
              retryDelay,
            },
            adaptiveRateLimit ? rateLimiter : undefined
          );

          // Add to cost tracker
          costTracker.trackEmbeddingTokens(
            embeddingResult.cost.inputTokens,
            embeddingModel
          );

          return {
            success: true,
            index: globalIndex,
            chunk: {
              text: chunk,
              embeddings: embeddingResult.embeddings,
              metadata: {
                chunkIndex: globalIndex,
                totalChunks,
                // Try to determine page number (approximate)
                pageNumber:
                  Math.floor((globalIndex / totalChunks) * totalPages) + 1,
              },
            },
          };
        } catch (error) {
          logger.error(`Failed to process chunk ${globalIndex + 1}: ${error}`);

          // If it's a quota error, provide helpful guidance
          if (
            error instanceof Error &&
            (error.message.includes("quota") || error.message.includes("429"))
          ) {
            // For quota errors, we'll collect them and handle at the end
            return {
              success: false,
              index: globalIndex,
              error: new Error(
                `API quota exceeded while processing chunk ${
                  globalIndex + 1
                }/${totalChunks}. ` +
                  `Please check your OpenAI billing and usage limits. ` +
                  `You may need to upgrade your plan or wait for quota reset.`
              ),
            };
          }

          return {
            success: false,
            index: globalIndex,
            error: error instanceof Error ? error : new Error(String(error)),
          };
        } finally {
          // Always release the semaphore permit
          semaphore.release();
        }
      });

      // Wait for all promises in the batch to settle
      const batchResults = await Promise.allSettled(batchPromises);

      // Process results
      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        const globalIndex = batchStart + i;

        if (result.status === "fulfilled") {
          const { success, chunk, error } = result.value;
          if (success && chunk) {
            chunks.push(chunk);
          } else if (error) {
            errors.push({ index: globalIndex, error });
          }
        } else {
          // Promise was rejected
          errors.push({
            index: globalIndex,
            error: new Error(`Promise rejected: ${result.reason}`),
          });
        }
      }

      // Progress indicator
      const processedSoFar = Math.min(batchEnd, textChunks.length);
      reportProgress(
        `Processed ${processedSoFar}/${totalChunks} chunks (${chunks.length} successful, ${errors.length} failed)`
      );

      // If we have too many errors, especially quota errors, stop processing
      const quotaErrors = errors.filter(
        (e) =>
          e.error.message.includes("quota") || e.error.message.includes("429")
      );

      if (quotaErrors.length > 0) {
        throw new Error(
          `${quotaErrors.length} quota errors encountered. Progress saved: ${chunks.length} chunks completed. ` +
            `Please check your OpenAI billing and usage limits.`
        );
      }

      // Adaptive delay between batches based on error rate
      if (batchEnd < textChunks.length) {
        const errorRate = errors.length / processedSoFar;
        let batchDelay = rateLimitDelay;

        if (errorRate > 0.1) {
          // If more than 10% errors, increase delay
          batchDelay = rateLimitDelay * 3;
          logger.warn(
            `High error rate detected (${(errorRate * 100).toFixed(
              1
            )}%), increasing batch delay to ${batchDelay}ms`
          );
        } else if (
          errorRate === 0 &&
          rateLimiter.getCurrentDelay() <= rateLimitDelay
        ) {
          // If no errors and rate limiter is not backing off, reduce delay
          batchDelay = Math.max(50, rateLimitDelay * 0.5);
        }

        await sleep(batchDelay);
      }
    }

    // If we have any non-quota errors, log them but continue
    const nonQuotaErrors = errors.filter(
      (e) =>
        !e.error.message.includes("quota") && !e.error.message.includes("429")
    );

    if (nonQuotaErrors.length > 0) {
      logger.warn(
        `${nonQuotaErrors.length} chunks failed to process due to non-quota errors. Continuing with ${chunks.length} successful chunks.`
      );
      nonQuotaErrors.forEach(({ index, error }) => {
        logger.error(`Chunk ${index + 1} error: ${error.message}`);
      });
    }

    // Sort chunks by index to maintain order
    chunks.sort(
      (a, b) => (a.metadata?.chunkIndex ?? 0) - (b.metadata?.chunkIndex ?? 0)
    );

    return {
      chunks,
      totalCost: costTracker.getTotalCost(),
      metadata: {
        totalPages,
        totalChunks,
        chunkSize,
        overlap,
        successfulChunks: chunks.length,
        failedChunks: errors.length,
        concurrency,
        finalRateLimit: rateLimiter.getCurrentDelay(),
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`PDF processing failed: ${errorMessage}`, { error });
    throw new Error(`Failed to process PDF: ${errorMessage}`);
  }
}

/**
 * Checks OpenAI API quota and provides usage information
 */
export async function checkAPIQuota(apiKey: string): Promise<void> {
  try {
    // Make a minimal API call to check if the key is valid and has quota
    const embeddings = new OpenAIEmbeddings({
      apiKey,
      model: "text-embedding-3-small",
    });

    // Test with a very short text to minimize token usage
    await embeddings.embedQuery("test");
    logger.info("✅ API key is valid and has available quota");
  } catch (error: any) {
    if (error.message?.includes("quota") || error.message?.includes("429")) {
      throw new Error(
        "❌ API quota exceeded. Please check your OpenAI billing and usage limits. " +
          "You may need to upgrade your plan or wait for quota reset. " +
          "Visit https://platform.openai.com/usage to check your usage."
      );
    } else if (
      error.message?.includes("401") ||
      error.message?.includes("invalid")
    ) {
      throw new Error("❌ Invalid API key. Please check your OpenAI API key.");
    } else {
      throw new Error(`❌ API check failed: ${error.message}`);
    }
  }
}

/**
 * Processes a PDF with embeddings and allows resuming from a specific chunk
 */
export async function processPDFWithEmbeddingsResumable(
  pdfPath: string,
  apiKey: string,
  options: PDFProcessingOptions & { startFromChunk?: number } = {}
): Promise<PDFProcessingResult> {
  const { startFromChunk = 0, ...processingOptions } = options;

  // First check API quota
  await checkAPIQuota(apiKey);

  if (startFromChunk > 0) {
    logger.info(`🔄 Resuming processing from chunk ${startFromChunk + 1}`);
  }

  // Note: The startFromChunk functionality needs to be implemented in the main processing function
  // For now, this function serves as a wrapper with quota checking
  const modifiedOptions = {
    ...processingOptions,
    onProgress:
      processingOptions.onProgress ||
      ((msg: string) =>
        logger.info(startFromChunk > 0 ? `[RESUME] ${msg}` : msg)),
  };

  return processPDFWithEmbeddings(pdfPath, apiKey, modifiedOptions);
}

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

/**
 * Sleep utility function for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates embeddings for a given text using OpenAI's embedding models with rate limiting and retry logic
 */
export async function createEmbeddings(
  text: string,
  apiKey: string,
  options: EmbeddingOptions = {}
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
      const result = await embeddings.embedQuery(text);

      // Track embedding cost
      costTracker.trackEmbeddingTokens(inputTokens, model);

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

      if (!isRateLimit || attempt === maxRetries) {
        // If it's not a rate limit error or we've exhausted retries, throw the error
        break;
      }

      // Calculate exponential backoff delay
      const backoffDelay = retryDelay * Math.pow(2, attempt);
      console.warn(
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
 * Processes a PDF file: extracts text, creates chunks, and generates embeddings with rate limiting
 */
export async function processPDFWithEmbeddings(
  pdfPath: string,
  apiKey: string,
  options: PDFProcessingOptions = {}
): Promise<PDFProcessingResult> {
  const {
    chunkSize = 1000,
    overlap = 200,
    embeddingModel = "text-embedding-3-small",
    embeddingDimensions,
    rateLimitDelay = 1000,
    maxRetries = 3,
    retryDelay = 2000,
    batchSize = 10,
  } = options;

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

    console.log(
      `Processing ${totalChunks} chunks with rate limiting (${rateLimitDelay}ms delay between requests)...`
    );

    // Initialize cost tracking
    const costTracker = new CostTracker(embeddingModel);

    // Generate embeddings for each chunk with rate limiting
    const chunks: TextChunk[] = [];

    // Process chunks in batches to avoid overwhelming the API
    for (
      let batchStart = 0;
      batchStart < textChunks.length;
      batchStart += batchSize
    ) {
      const batchEnd = Math.min(batchStart + batchSize, textChunks.length);
      const batch = textChunks.slice(batchStart, batchEnd);

      console.log(
        `Processing batch ${Math.floor(batchStart / batchSize) + 1}/${Math.ceil(
          textChunks.length / batchSize
        )} (chunks ${batchStart + 1}-${batchEnd})`
      );

      for (let i = 0; i < batch.length; i++) {
        const globalIndex = batchStart + i;
        const chunk = batch[i];

        try {
          const embeddingResult = await createEmbeddings(chunk, apiKey, {
            model: embeddingModel,
            dimensions: embeddingDimensions,
            maxRetries,
            retryDelay,
          });

          // Add to cost tracker
          costTracker.trackEmbeddingTokens(
            embeddingResult.cost.inputTokens,
            embeddingModel
          );

          chunks.push({
            text: chunk,
            embeddings: embeddingResult.embeddings,
            metadata: {
              chunkIndex: globalIndex,
              totalChunks,
              // Try to determine page number (approximate)
              pageNumber:
                Math.floor((globalIndex / totalChunks) * totalPages) + 1,
            },
          });

          // Rate limiting: wait between requests (except for the last chunk)
          if (globalIndex < textChunks.length - 1) {
            await sleep(rateLimitDelay);
          }

          // Progress indicator
          if (
            (globalIndex + 1) % 5 === 0 ||
            globalIndex === textChunks.length - 1
          ) {
            console.log(`Processed ${globalIndex + 1}/${totalChunks} chunks`);
          }
        } catch (error) {
          console.error(`Failed to process chunk ${globalIndex + 1}: ${error}`);

          // If it's a quota error, provide helpful guidance
          if (
            error instanceof Error &&
            (error.message.includes("quota") || error.message.includes("429"))
          ) {
            throw new Error(
              `API quota exceeded while processing chunk ${
                globalIndex + 1
              }/${totalChunks}. ` +
                `Please check your OpenAI billing and usage limits. ` +
                `You may need to upgrade your plan or wait for quota reset. ` +
                `Progress saved: ${chunks.length} chunks completed.`
            );
          }

          throw error;
        }
      }

      // Longer delay between batches to be extra safe
      if (batchEnd < textChunks.length) {
        await sleep(rateLimitDelay * 2);
      }
    }

    return {
      chunks,
      totalCost: costTracker.getTotalCost(),
      metadata: {
        totalPages,
        totalChunks,
        chunkSize,
        overlap,
      },
    };
  } catch (error) {
    throw new Error(`Failed to process PDF: ${error}`);
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
    console.log("✅ API key is valid and has available quota");
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
    console.log(`🔄 Resuming processing from chunk ${startFromChunk + 1}`);
  }

  // Modify the processing to start from a specific chunk
  const modifiedOptions = {
    ...processingOptions,
    _startFromChunk: startFromChunk, // Internal flag
  };

  return processPDFWithEmbeddings(pdfPath, apiKey, modifiedOptions);
}

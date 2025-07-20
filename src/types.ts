export interface PersonalityConfig {
  customPersonality?: string; // Custom personality description
  supervisorName?: string; // Custom name for the AI supervisor (default: "Cadbury")
}

export interface WebAutomationConfig {
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
  timeout?: number;
  slowMo?: number;
  devtools?: boolean;
  interactive?: boolean; // Allow human intervention
  showBrowser?: boolean; // Show browser window for debugging
}

export interface AgentCapability {
  name: string;
  description: string;
  tools: string[];
  systemPrompt: string;
}

export interface TaskAnalysis {
  taskType: "web_automation" | "research" | "general" | "mixed";
  requiredCapabilities: string[];
  suggestedAgents: AgentCapability[];
  reasoning: string;
}

export interface CadburyConfig {
  openaiApiKey?: string;
  tavilyApiKey?: string;
  modelName?: string;
  temperature?: number;
  personality?: PersonalityConfig;
  webAutomation?: WebAutomationConfig;
}

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  tools?: any[];
}

export interface CostInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number; // in USD
  model: string;
}

export interface StreamResult {
  agentName: string;
  content: string;
  isComplete: boolean;
  cost?: CostInfo;
}

export interface CadburyResponse {
  messages: string[];
  isComplete: boolean;
  totalCost?: CostInfo;
}

export interface WorkflowOptions {
  recursionLimit?: number;
  streaming?: boolean;
  includeWebAgent?: boolean;
  confirmSensitiveActions?: boolean;
}

export interface EmbeddingResult {
  embeddings: number[];
  cost: CostInfo;
  dimensions: number;
}

export interface EmbeddingOptions {
  model?: string; // Default: "text-embedding-3-small"
  dimensions?: number; // Optional dimension reduction
  rateLimitDelay?: number; // Delay between requests in milliseconds (default: 1000)
  maxRetries?: number; // Maximum number of retries (default: 3)
  retryDelay?: number; // Base delay for exponential backoff in milliseconds (default: 2000)
}

export interface TextChunk {
  text: string;
  embeddings: number[];
  metadata?: {
    chunkIndex: number;
    pageNumber?: number;
    totalChunks: number;
  };
}

export interface PDFProcessingResult {
  chunks: TextChunk[];
  totalCost: CostInfo;
  metadata: {
    totalPages: number;
    totalChunks: number;
    chunkSize: number;
    overlap: number;
  };
}

export interface PDFProcessingOptions {
  chunkSize?: number; // Default: 1000 characters
  overlap?: number; // Default: 200 characters
  embeddingModel?: string; // Default: "text-embedding-3-small"
  embeddingDimensions?: number; // Optional dimension reduction
  rateLimitDelay?: number; // Delay between embedding requests in milliseconds (default: 1000)
  maxRetries?: number; // Maximum number of retries for each embedding (default: 3)
  retryDelay?: number; // Base delay for exponential backoff in milliseconds (default: 2000)
  batchSize?: number; // Process embeddings in batches (default: 10)
}

export interface RAGOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topK?: number; // Number of most relevant chunks to use
  similarityThreshold?: number; // Minimum similarity score
}

export interface RAGResult {
  answer: string;
  relevantChunks: TextChunk[];
  cost: CostInfo;
  sources: string[];
}

export interface GuardRails {
  allowedTopics?: string[];
  forbiddenTopics?: string[];
  maxResponseLength?: number;
  requireCitation?: boolean;
  customGuardPrompt?: string;
}

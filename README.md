# Cadbury - Your AI Butler 🤖

Greetings, esteemed developer! I am Cadbury, your intelligent AI butler and task manager. I excel at understanding your requests, creating action plans, and coordinating with specialized agents when needed. I can handle many tasks myself, but when specialized knowledge is required, I'll delegate to the right agents and synthesize their responses into a comprehensive answer for you.

## 🌟 Features

- **Intelligent Task Management**: Cadbury analyzes your requests and creates action plans
- **Multi-Agent Coordination**: Delegates to specialized agents when needed
- **Direct Response Capability**: Handles many tasks without needing other agents
- **Real-time Streaming**: See Cadbury's thought process and actions in real-time
- **Custom Agent Support**: Add your own specialized agents
- **Research Capabilities**: Built-in web research via the researcher agent
- **Document Processing**: Extract text from PDFs and create embeddings
- **RAG System**: Query against your documents using Retrieval-Augmented Generation
- **Guard Rails**: Implement safety measures and topic restrictions
- **Simple Chat Interface**: Easy sync flow for direct communication with Cadbury
- **TypeScript Ready**: Full TypeScript support with type definitions

## 📦 Installation

```bash
npm install cadbury
```

## 🚀 Quick Start

### Simple Chat Interface

```typescript
import { createCadburyButler, chatWithCadbury, CadburyConfig } from "cadbury";

const config: CadburyConfig = {
  openaiApiKey: "your-openai-api-key",
  tavilyApiKey: "your-tavily-api-key", // Optional for research
  modelName: "gpt-4", // Optional, defaults to gpt-3.5-turbo
  temperature: 0, // Optional
  personality: {
    tone: "witty",
    audience: "k12",
    style: "engaging",
    useEmojis: true,
  },
};

async function main() {
  // Initialize Cadbury with personality
  const butler = await createCadburyButler(config);

  // Simple chat - just get the final answer
  const response = await chatWithCadbury(
    butler,
    "Explain the latest developments in AI and help me understand the key trends"
  );

  console.log(response);
}

main();
```

### Custom Personality

```typescript
const config: CadburyConfig = {
  openaiApiKey: "your-openai-api-key",
  personality: {
    customPersonality:
      "You are a friendly pirate butler who explains things using nautical metaphors and says 'Ahoy matey!' frequently. You're educational but fun, using sailing and ocean analogies to make concepts clear.",
  },
};
```

### Streaming Interface

```typescript
import { createCadburyButler, streamCadburyResponse } from "cadbury";

async function streamingExample() {
  const butler = await createCadburyButler(config);

  await streamCadburyResponse(
    butler,
    "Research the current state of quantum computing and explain its implications",
    (content, agentName, isComplete) => {
      console.log(`[${agentName}]: ${content}`);
      if (isComplete) {
        console.log("Task completed!");
      }
    }
  );
}
```

## 🤖 How Cadbury Works

Cadbury operates as your intelligent task manager:

1. **Analysis**: Understands your request and creates an action plan
2. **Decision**: Determines if specialized agents are needed or if he can handle it directly
3. **Delegation**: When needed, hands off to specialized agents (researcher, custom agents)
4. **Synthesis**: Combines agent responses into a comprehensive final answer
5. **Streaming**: Keeps you informed about his thought process and actions

### Built-in Agent

- **Researcher**: Web research capabilities using Tavily search for current information

## 🔧 API Reference

### `createCadburyButler(config: CadburyConfig)`

Creates and initializes a new Cadbury butler instance.

**Parameters:**

- `config.openaiApiKey` (string): Your OpenAI API key
- `config.tavilyApiKey` (string, optional): Your Tavily API key for web search
- `config.modelName` (string, optional): OpenAI model to use (default: "gpt-3.5-turbo")
- `config.temperature` (number, optional): Temperature for AI responses (default: 0)
- `config.personality` (PersonalityConfig, optional): Customize Cadbury's personality and communication style

### Personality Configuration

The `personality` config allows you to customize Cadbury's communication style:

```typescript
interface PersonalityConfig {
  tone?:
    | "professional"
    | "friendly"
    | "witty"
    | "educational"
    | "casual"
    | "formal";
  audience?:
    | "general"
    | "k12"
    | "university"
    | "professional"
    | "kids"
    | "adults";
  style?:
    | "concise"
    | "detailed"
    | "humorous"
    | "serious"
    | "engaging"
    | "academic";
  useEmojis?: boolean;
  customPersonality?: string; // Override with custom personality description
}
```

**Examples:**

```typescript
// For K-12 students
personality: {
  tone: "witty",
  audience: "k12",
  style: "engaging",
  useEmojis: true
}

// Professional setting
personality: {
  tone: "professional",
  audience: "professional",
  style: "concise",
  useEmojis: false
}

// Custom personality
personality: {
  customPersonality: "You are a wise owl professor who loves teaching with forest analogies and always ends responses with 'Hoot hoot!'"
}
```

**Returns:** `Promise<CadburyWorkflow>`

### `chatWithCadbury(workflow, message)`

Simple synchronous chat interface. Get the final result directly.

**Parameters:**

- `workflow`: The initialized CadburyWorkflow instance
- `message` (string): Your request or task description

**Returns:** `Promise<string>` - The final response from Cadbury

### `streamCadburyResponse(workflow, message, onUpdate)`

Stream Cadbury's responses in real-time to see his thought process.

**Parameters:**

- `workflow`: The initialized CadburyWorkflow instance
- `message` (string): Your request or task description
- `onUpdate` (function): Callback for each update `(content, agentName, isComplete) => void`

**Returns:** `Promise<void>`

### `runWorkflow(workflow, message, options?)`

Advanced workflow execution with full control.

**Parameters:**

- `workflow`: The initialized CadburyWorkflow instance
- `message` (string): Your request or task description
- `options.recursionLimit` (number, optional): Maximum recursion limit (default: 100)
- `options.streaming` (boolean, optional): Whether to use streaming (default: false)

**Returns:** `Promise<CadburyResponse>`

## 🎯 Example Use Cases

### Knowledge Questions

```typescript
const response = await chatWithCadbury(
  butler,
  "Explain quantum computing in simple terms"
);
```

### Research Tasks

```typescript
const response = await chatWithCadbury(
  butler,
  "Research the latest AI breakthroughs in 2024"
);
```

### Analysis and Synthesis

```typescript
const response = await chatWithCadbury(
  butler,
  "Compare the pros and cons of different cloud providers"
);
```

### Mathematical Calculations

```typescript
const response = await chatWithCadbury(
  butler,
  "Calculate the compound interest on $10,000 at 5% for 10 years"
);
```

## 🔧 Adding Custom Agents

You can extend Cadbury with specialized agents:

```typescript
import { createCustomAgent, createTextAnalysisTool } from "cadbury";

async function addDataAnalyst() {
  const butler = await createCadburyButler(config);

  // Add a custom data analyst agent
  await butler.addCustomAgent({
    name: "data_analyst",
    systemPrompt:
      "You are a data analyst expert. Analyze data patterns, create insights, and provide statistical analysis.",
    tools: [createTextAnalysisTool(), createCalculatorTool()],
  });

  const response = await chatWithCadbury(
    butler,
    "Analyze this sales data and provide insights: [data]"
  );
}
```

## 🛠️ Available Tools for Custom Agents

Cadbury provides several built-in tools you can use with custom agents:

1. **createTavilyTool(apiKey)**: Web search capabilities
2. **createTextAnalysisTool()**: Text analysis for sentiment, topics, summaries
3. **createCalculatorTool()**: Mathematical calculations
4. **createEmbeddingTool(apiKey)**: Generate embeddings for text
5. **createPDFProcessingTool(apiKey)**: Process PDFs and create embeddings

You can also create your own tools using the LangChain `DynamicStructuredTool` pattern.

## 💡 Example Scenarios

### Research and Analysis

```typescript
const response = await chatWithCadbury(
  butler,
  "Research the latest developments in renewable energy and summarize the key trends"
);
```

### Problem Solving

```typescript
const response = await chatWithCadbury(
  butler,
  "Help me understand the best practices for microservices architecture"
);
```

### Real-time Streaming

```typescript
await streamCadburyResponse(
  butler,
  "Analyze the current state of the electric vehicle market",
  (content, agentName, isComplete) => {
    console.log(`[${agentName}]: ${content}`);
    if (isComplete) {
      console.log("Analysis complete!");
    }
  }
);
```

## 🛠️ Advanced Usage

### Generate Embeddings

Cadbury provides a convenient function to generate embeddings using OpenAI's embedding models:

```typescript
import { createEmbeddings, EmbeddingOptions } from "cadbury";

// Basic usage with default settings
const result = await createEmbeddings(
  "Your text to embed here",
  "your-openai-api-key"
);

console.log("Embeddings:", result.embeddings);
console.log("Cost:", result.cost);
console.log("Dimensions:", result.dimensions);

// Advanced usage with custom options
const options: EmbeddingOptions = {
  model: "text-embedding-3-large", // or "text-embedding-3-small", "text-embedding-ada-002"
  dimensions: 1536, // Optional dimension reduction
};

const advancedResult = await createEmbeddings(
  "Your text to embed here",
  "your-openai-api-key",
  options
);
```

### Process PDF with Embeddings

Extract text from PDFs, create chunks, and generate embeddings for each chunk:

```typescript
import { processPDFWithEmbeddings, PDFProcessingOptions } from "cadbury";

// Basic PDF processing
const pdfResult = await processPDFWithEmbeddings(
  "/path/to/your/document.pdf",
  "your-openai-api-key"
);

console.log("Chunks:", pdfResult.chunks.length);
console.log("Total cost:", pdfResult.totalCost);
console.log("Metadata:", pdfResult.metadata);

// Access individual chunks with embeddings
pdfResult.chunks.forEach((chunk, index) => {
  console.log(`Chunk ${index}:`, chunk.text);
  console.log(`Embeddings dimensions:`, chunk.embeddings.length);
  console.log(`Page:`, chunk.metadata?.pageNumber);
});

// Advanced PDF processing with custom options
const pdfOptions: PDFProcessingOptions = {
  chunkSize: 1500, // Larger chunks
  overlap: 300, // More overlap between chunks
  embeddingModel: "text-embedding-3-large",
  embeddingDimensions: 1024, // Reduced dimensions
};

const advancedPdfResult = await processPDFWithEmbeddings(
  "/path/to/your/document.pdf",
  "your-openai-api-key",
  pdfOptions
);
```

### Using Embedding and PDF Tools with Cadbury

You can add embedding and PDF processing capabilities as tools that Cadbury can use autonomously:

```typescript
import {
  createCadburyButler,
  createEmbeddingTool,
  createPDFProcessingTool,
  createCustomAgent,
} from "cadbury";

// Create a custom agent with embedding and PDF tools
const config = {
  openaiApiKey: "your-openai-api-key",
  tavilyApiKey: "your-tavily-api-key", // optional
};

const butler = await createCadburyButler(config);

// Add tools to Cadbury
const embeddingTool = createEmbeddingTool(config.openaiApiKey);
const pdfTool = createPDFProcessingTool(config.openaiApiKey);

// Now Cadbury can use these tools automatically
const response = await chatWithCadbury(
  butler,
  "Generate embeddings for the text 'Hello world' and tell me the cost"
);

// Or process a PDF
const pdfResponse = await chatWithCadbury(
  butler,
  "Process the PDF at /path/to/document.pdf and create embeddings for all chunks"
);
```

### Query Against Embeddings (RAG)

Query against your embedded documents using Retrieval-Augmented Generation:

```typescript
import {
  createEmbeddings,
  processPDFWithEmbeddings,
  queryWithEmbeddings,
  SimpleRAG,
  RAGOptions,
  GuardRails,
} from "cadbury";

// Step 1: Process your PDF and get embeddings
const pdfResult = await processPDFWithEmbeddings(
  "/path/to/document.pdf",
  "your-openai-api-key"
);

// Step 2: Create embedding for your query
const queryResult = await createEmbeddings(
  "What are the main conclusions of this document?",
  "your-openai-api-key"
);

// Step 3: Query against the embeddings with guard rails
const ragOptions: RAGOptions = {
  model: "gpt-4o-mini",
  temperature: 0,
  topK: 3, // Use top 3 most relevant chunks
  similarityThreshold: 0.7, // Minimum similarity score
};

const guardRails: GuardRails = {
  allowedTopics: ["research", "conclusions", "methodology"],
  forbiddenTopics: ["personal information", "private data"],
  requireCitation: true,
  maxResponseLength: 1000,
};

const answer = await queryWithEmbeddings(
  "What are the main conclusions of this document?",
  queryResult.embeddings,
  pdfResult.chunks,
  "your-openai-api-key",
  ragOptions,
  guardRails
);

console.log("Answer:", answer.answer);
console.log("Sources:", answer.sources);
console.log("Cost:", answer.cost);
```

### Simple RAG System

For easier RAG operations, use the SimpleRAG class:

```typescript
import { SimpleRAG, processPDFWithEmbeddings, createEmbeddings } from "cadbury";

// Create RAG system with guard rails
const rag = new SimpleRAG(
  "your-openai-api-key",
  {
    model: "gpt-4o-mini",
    topK: 5,
    similarityThreshold: 0.6,
  },
  {
    allowedTopics: ["science", "research"],
    requireCitation: true,
    customGuardPrompt:
      "Only answer questions about scientific research. Always cite sources.",
  }
);

// Add chunks from PDF
const pdfResult = await processPDFWithEmbeddings(
  "/path/to/doc.pdf",
  "your-api-key"
);
rag.addChunks(pdfResult.chunks);

// Query the system
const queryEmbedding = await createEmbeddings(
  "What is photosynthesis?",
  "your-api-key"
);
const result = await rag.query(
  "What is photosynthesis?",
  queryEmbedding.embeddings
);

console.log("Answer:", result.answer);
console.log("Relevant chunks:", result.relevantChunks.length);
```

### Guard Rails for Safe AI

Implement safety measures and topic restrictions:

```typescript
const strictGuardRails: GuardRails = {
  allowedTopics: ["science", "technology", "education"],
  forbiddenTopics: ["politics", "personal information", "medical advice"],
  maxResponseLength: 500,
  requireCitation: true,
  customGuardPrompt: `You are a science education assistant. 
    - Only answer questions about science and technology
    - Always provide citations
    - Keep answers educational and factual
    - If asked about forbidden topics, politely decline`,
};

// Use with RAG
const safeAnswer = await queryWithEmbeddings(
  query,
  queryEmbedding,
  chunks,
  apiKey,
  ragOptions,
  strictGuardRails
);
```

### Combining Cadbury with RAG and Guard Rails

Use Cadbury as an intelligent planner while having direct RAG access:

````typescript
import {
  createCadburyButler,
  SimpleRAG,
  processPDFWithEmbeddings,
  createEmbeddings,
  chatWithCadbury
} from "cadbury";

// Setup Cadbury with custom personality
const config = {
  openaiApiKey: "your-openai-api-key",
  personality: {
    tone: "professional",
    audience: "university",
    style: "academic",
    customPersonality: "You are a research assistant who helps with academic work. Always be precise and cite sources."
  }
};

const butler = await createCadburyButler(config);

// Setup RAG system for direct document queries
const rag = new SimpleRAG(
  config.openaiApiKey,
  { model: "gpt-4o-mini", topK: 3 },
  {
    allowedTopics: ["research", "academic"],
    requireCitation: true
  }
);

// Process research documents
const pdfResult = await processPDFWithEmbeddings(
  "/path/to/research-paper.pdf",
  config.openaiApiKey
);
rag.addChunks(pdfResult.chunks);

// Use Cadbury for complex planning and analysis
const cadburyResponse = await chatWithCadbury(
  butler,
  "Analyze the current trends in quantum computing and create a research roadmap"
);

// Use RAG for specific document queries
const queryEmbedding = await createEmbeddings(
  "What methodology was used in this study?",
  config.openaiApiKey
);

const ragResponse = await rag.query(
  "What methodology was used in this study?",
  queryEmbedding.embeddings
);

console.log("Cadbury's analysis:", cadburyResponse);
console.log("Document-specific answer:", ragResponse.answer);

### Creating Custom Tools

```typescript
import { DynamicStructuredTool } from "langchain/tools";
import { z } from "zod";

const customTool = new DynamicStructuredTool({
  name: "custom_analysis",
  description: "Performs custom analysis",
  schema: z.object({
    data: z.string(),
  }),
  func: async ({ data }) => {
    // Your custom logic here
    return "Analysis complete";
  },
});

// Use in custom agent
await butler.addCustomAgent({
  name: "specialist",
  systemPrompt: "You are a specialist with custom capabilities",
  tools: [customTool],
});
````

## 🔑 Environment Variables

You can also set API keys via environment variables:

```bash
export OPENAI_API_KEY="your-openai-key"
export TAVILY_API_KEY="your-tavily-key"
```

## 📋 Requirements

- Node.js 16+
- OpenAI API key
- Tavily API key (optional, for web search functionality)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For issues and questions, please open an issue on the GitHub repository.

---

_"At your service, as always!"_ - Cadbury 🎩

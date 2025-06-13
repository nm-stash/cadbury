# Cadbury - Your AI Butler 🤖

Greetings, esteemed developer! I am Cadbury, your trusty AI butler, inspired by the ever-diligent and resourceful butler of Richie Rich. I am here to serve you in the realm of code, utilizing the latest in Large Language Models (LLMs) and multi-agent systems to assist with various tasks.

## 🌟 Features

- **Multi-Agent Architecture**: Built on LangGraph with specialized agents for different tasks
- **Configurable Agents**: Add custom agents with specific capabilities
- **Real-time Streaming**: Stream responses as they're generated
- **Chart Generation**: Built-in support for creating beautiful bar charts
- **Web Research**: Integrated web search capabilities via Tavily
- **TypeScript Ready**: Full TypeScript support with type definitions

## 📦 Installation

```bash
npm install cadbury
```

## 🚀 Quick Start

```typescript
import { createCadburyButler, runWorkflow, CadburyConfig } from "cadbury";

// Configure your AI butler
const config: CadburyConfig = {
  openaiApiKey: "your-openai-api-key",
  tavilyApiKey: "your-tavily-api-key", // Optional for search
  modelName: "gpt-3.5-turbo", // Optional
  temperature: 0, // Optional
};

async function main() {
  // Initialize Cadbury
  const butler = await createCadburyButler(config);

  // Run a task
  const response = await runWorkflow(
    butler,
    "Research the top 5 AI companies and create a bar chart of their market caps"
  );

  console.log(response.messages);
  if (response.chartUrls) {
    console.log("Charts:", response.chartUrls);
  }
}

main();
```

## 🔧 API Reference

### `createCadburyButler(config: CadburyConfig)`

Creates and initializes a new Cadbury butler instance.

**Parameters:**

- `config.openaiApiKey` (string): Your OpenAI API key
- `config.tavilyApiKey` (string, optional): Your Tavily API key for web search
- `config.modelName` (string, optional): OpenAI model to use (default: "gpt-3.5-turbo")
- `config.temperature` (number, optional): Temperature for AI responses (default: 0)

**Returns:** `Promise<CadburyWorkflow>`

### `runWorkflow(workflow, message, options?)`

Executes a complete workflow and returns the final result.

**Parameters:**

- `workflow`: The initialized CadburyWorkflow instance
- `message` (string): Your request or task description
- `options.recursionLimit` (number, optional): Maximum recursion limit (default: 100)
- `options.streaming` (boolean, optional): Whether to use streaming (default: false)

**Returns:** `Promise<CadburyResponse>`

### `streamWorkflow(workflow, message, options?)`

Streams workflow results in real-time.

**Parameters:**

- `workflow`: The initialized CadburyWorkflow instance
- `message` (string): Your request or task description
- `options.recursionLimit` (number, optional): Maximum recursion limit (default: 100)

**Returns:** `AsyncGenerator<StreamResult>`

## 🤖 Built-in Agents

Cadbury comes with two specialized agents:

1. **Researcher**: Web research capabilities using Tavily search
2. **Chart Generator**: Creates beautiful bar charts from data

## 🎯 Example Use Cases

### Stock Market Analysis

```typescript
const response = await runWorkflow(
  butler,
  "What are the top 10 stocks in the S&P 500 by market cap? Show them in a bar chart."
);
```

### Data Visualization

```typescript
const response = await runWorkflow(
  butler,
  "Research the population of the 5 largest cities in the world and create a bar chart"
);
```

### Real-time Streaming

```typescript
for await (const result of streamWorkflow(
  butler,
  "Analyze the tech industry trends"
)) {
  console.log(`[${result.agentName}]: ${result.content}`);
  if (result.isComplete) break;
}
```

## 🛠️ Advanced Usage

### Adding Custom Agents

```typescript
import { createCustomAgent, AgentConfig } from "cadbury";

const customAgentConfig: AgentConfig = {
  name: "code_reviewer",
  systemPrompt:
    "You are an expert code reviewer. Analyze code for best practices.",
  tools: [
    /* your custom tools */
  ],
};

// Add to workflow
await workflow.addCustomAgent(customAgentConfig);
```

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
```

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
Greetings, esteemed developer! I am Cadbury, your trusty AI butler, inspired by the ever-diligent and resourceful butler of Richie Rich. I am here to serve you in the realm of code, utilizing the latest in Large Language Models (LLMs) to assist with various programming tasks. Whether it's debugging, writing code snippets, or providing insightful suggestions, you can count on me to make your development journey as smooth and efficient as possible. Just install me through npm, and let me take care of the rest. Your coding experience is about to become much more refined.

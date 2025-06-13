# Cadbury Library - Quick Start Examples

## Simple Usage

```typescript
import { createCadburyButler, runWorkflow } from "@supreme-observer/cadbury";

const config = {
  openaiApiKey: process.env.OPENAI_API_KEY!,
  tavilyApiKey: process.env.TAVILY_API_KEY, // Optional
};

const butler = await createCadburyButler(config);
const response = await runWorkflow(
  butler,
  "Analyze top 5 AI companies and create a chart"
);

console.log(response.messages);
if (response.chartUrls) {
  console.log("Charts:", response.chartUrls);
}
```

## Streaming Example

```typescript
import { streamWorkflow } from "@supreme-observer/cadbury";

for await (const result of streamWorkflow(
  butler,
  "Research and visualize data"
)) {
  console.log(`[${result.agentName}]: ${result.content}`);
  if (result.isComplete) break;
}
```

## Custom Agent Example

```typescript
import { createCustomAgent, createTavilyTool } from "@supreme-observer/cadbury";

const workflow = await createCadburyButler(config);

await workflow.addCustomAgent({
  name: "code_analyzer",
  systemPrompt: "You analyze code for best practices and security issues.",
  tools: [
    /* custom tools */
  ],
});
```

## Available Agents

- **Researcher**: Web search and information gathering using Tavily
- **Chart Generator**: Creates beautiful bar charts from data
- **Custom Agents**: Add your own specialized agents

## Environment Variables

```bash
export OPENAI_API_KEY="your-openai-key"
export TAVILY_API_KEY="your-tavily-key"  # Optional
```

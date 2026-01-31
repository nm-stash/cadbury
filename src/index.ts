// Main library exports
import { HumanMessage } from "@langchain/core/messages";
import { CadburyWorkflow } from "./graph";
import { CadburyChain } from "./cadbury";
import { createAgent } from "./agent";
import {
  createWebSearchTool,
  createTavilyTool,
  createTextAnalysisTool,
  createCalculatorTool,
  createEmbeddingTool,
  createPDFProcessingTool,
  createMCPClientTool,
  discoverMCPTools,
} from "./tools";
import {
  CadburyConfig,
  PersonalityConfig,
  AgentConfig,
  StreamResult,
  CadburyResponse,
  WorkflowOptions,
  CostInfo,
  EmbeddingResult,
  EmbeddingOptions,
  TextChunk,
  PDFProcessingResult,
  PDFProcessingOptions,
  RAGOptions,
  RAGResult,
  GuardRails,
  WebAutomationConfig,
  DirectAgentOptions,
  DirectAgentResult,
  MCPToolConfig,
  MCPDiscoveredTool,
} from "./types";
import { CostTracker } from "./cost-tracker";
import { createWebAutomationTool } from "./web-automation";
import { createWebAgent } from "./web-agent";
import { createEmbeddings, processPDFWithEmbeddings } from "./pdf-processor";
import { queryWithEmbeddings, findRelevantChunks, SimpleRAG } from "./rag";

/**
 * Creates a new Cadbury AI butler instance
 * @param config Configuration including API keys and model settings
 * @returns CadburyWorkflow instance
 */
export async function createCadburyButler(
  config: CadburyConfig
): Promise<CadburyWorkflow> {
  const workflow = new CadburyWorkflow(config);
  await workflow.initialize();
  return workflow;
}

/**
 * Runs a Cadbury workflow with a user message
 * @param workflow The initialized CadburyWorkflow instance
 * @param message The user's message/request
 * @param options Optional workflow configuration
 * @returns Promise that resolves to the response
 */
export async function runWorkflow(
  workflow: CadburyWorkflow,
  message: string,
  options: WorkflowOptions = {}
): Promise<CadburyResponse> {
  const { recursionLimit = 100, streaming = false } = options;

  const compiledWorkflow = workflow.getWorkflow();
  const messages: string[] = [];

  if (streaming) {
    const streamResults = compiledWorkflow.stream(
      {
        messages: [new HumanMessage({ content: message })],
      },
      { recursionLimit }
    );

    for await (const output of await streamResults) {
      if (output && typeof output === "object") {
        Object.keys(output).forEach((key) => {
          if (key !== "__end__") {
            const value = (output as any)[key];
            if (value && value.messages && value.messages.length > 0) {
              value.messages.forEach((msg: { content: string }) => {
                messages.push(msg.content);
              });
            }
          }
        });
      }
    }
  } else {
    const result = await compiledWorkflow.invoke(
      {
        messages: [new HumanMessage({ content: message })],
      },
      { recursionLimit }
    );

    if (result.messages && Array.isArray(result.messages)) {
      (result.messages as Array<{ content: string }>).forEach((msg) => {
        messages.push(msg.content);
      });
    }
  }

  return {
    messages,
    isComplete: true,
    totalCost: workflow.getCostTracker().getTotalCost(),
  };
}

/**
 * Streams results from a Cadbury workflow
 * @param workflow The initialized CadburyWorkflow instance
 * @param message The user's message/request
 * @param options Optional workflow configuration
 * @returns AsyncGenerator that yields StreamResult objects
 */
export async function* streamWorkflow(
  workflow: CadburyWorkflow,
  message: string,
  options: WorkflowOptions = {}
): AsyncGenerator<StreamResult, void, unknown> {
  const { recursionLimit = 100 } = options;

  const compiledWorkflow = workflow.getWorkflow();
  const streamResults = compiledWorkflow.stream(
    {
      messages: [new HumanMessage({ content: message })],
    },
    { recursionLimit }
  );

  for await (const output of await streamResults) {
    if (output && typeof output === "object") {
      for (const [agentName, value] of Object.entries(output)) {
        if (
          agentName !== "__end__" &&
          value &&
          typeof value === "object" &&
          "messages" in value
        ) {
          const agentOutput = value as { messages: { content: string }[] };
          if (agentOutput.messages && agentOutput.messages.length > 0) {
            for (const msg of agentOutput.messages) {
              yield {
                agentName,
                content: msg.content,
                isComplete: false,
              };
            }
          }
        }
      }
    } else {
      yield {
        agentName: "cadbury",
        content: "Task completed successfully!",
        isComplete: true,
      };
    }
  }
}

/**
 * Creates a custom agent that can be added to a Cadbury workflow
 * @param config Agent configuration including name, prompt, and tools
 * @param llm The language model instance to use
 * @returns Promise that resolves to the created agent
 */
export async function createCustomAgent(
  config: AgentConfig,
  llm: any
): Promise<any> {
  return await createAgent(llm, config.tools || [], config.systemPrompt);
}

/**
 * Simple synchronous chat interface with Cadbury
 * This provides an easy way to chat with Cadbury and get the final result
 * @param workflow The initialized CadburyWorkflow instance
 * @param message The user's message/request
 * @returns Promise that resolves to the final response string
 */
export async function chatWithCadbury(
  workflow: CadburyWorkflow,
  message: string
): Promise<string> {
  const response = await runWorkflow(workflow, message);

  // Return only the final response from Cadbury
  const cadburyResponses = response.messages.filter(
    (msg) =>
      msg.includes("Cadbury") || msg.includes("plan:") || !msg.includes(":")
  );

  return (
    cadburyResponses[cadburyResponses.length - 1] ||
    response.messages[response.messages.length - 1] ||
    "I apologize, but I wasn't able to process your request properly."
  );
}

/**
 * Chat with Cadbury and get both response and cost information
 * @param workflow The initialized CadburyWorkflow instance
 * @param message The user's message/request
 * @returns Promise that resolves to response and cost info
 */
export async function chatWithCadburyWithCost(
  workflow: CadburyWorkflow,
  message: string
): Promise<{ response: string; cost: any }> {
  // Reset cost tracker for this conversation
  workflow.getCostTracker().reset();

  const result = await runWorkflow(workflow, message);

  // Return only the final response from Cadbury
  const cadburyResponses = result.messages.filter(
    (msg) =>
      msg.includes("Cadbury") || msg.includes("plan:") || !msg.includes(":")
  );

  const response =
    cadburyResponses[cadburyResponses.length - 1] ||
    result.messages[result.messages.length - 1] ||
    "I apologize, but I wasn't able to process your request properly.";

  return {
    response,
    cost: result.totalCost,
  };
}

/**
 * Stream responses from Cadbury with real-time updates
 * @param workflow The initialized CadburyWorkflow instance
 * @param message The user's message/request
 * @param onUpdate Callback function called for each update
 * @returns Promise that resolves when streaming is complete
 */
export async function streamCadburyResponse(
  workflow: CadburyWorkflow,
  message: string,
  onUpdate: (content: string, agentName: string, isComplete: boolean) => void
): Promise<void> {
  for await (const result of streamWorkflow(workflow, message)) {
    onUpdate(result.content, result.agentName, result.isComplete);
  }
}

/**
 * Run a single agent directly with tools, bypassing the supervisor.
 * Ideal for user-created agents with pre-defined tool sets.
 * Does not require initialization of the full workflow graph.
 * @param config CadburyConfig with API keys and model settings
 * @param agentConfig Agent configuration (name, systemPrompt, tools)
 * @param message The task/instruction for the agent
 * @param options Optional execution options (maxIterations, onToolCall middleware)
 * @returns DirectAgentResult with output, cost, duration, and tool calls log
 */
export async function runDirectAgent(
  config: CadburyConfig,
  agentConfig: AgentConfig,
  message: string,
  options?: DirectAgentOptions
): Promise<DirectAgentResult> {
  const workflow = new CadburyWorkflow(config);
  return workflow.runAgentDirectly(agentConfig, message, options);
}

// Export all types and classes for advanced usage
export {
  CadburyWorkflow,
  CadburyChain,
  createAgent,
  createWebSearchTool,
  createTavilyTool,
  createTextAnalysisTool,
  createCalculatorTool,
  createEmbeddingTool,
  createPDFProcessingTool,
  createWebAutomationTool,
  createWebAgent,
  createMCPClientTool,
  discoverMCPTools,
  CadburyConfig,
  PersonalityConfig,
  AgentConfig,
  StreamResult,
  CadburyResponse,
  WorkflowOptions,
  CostInfo,
  EmbeddingResult,
  EmbeddingOptions,
  TextChunk,
  PDFProcessingResult,
  PDFProcessingOptions,
  RAGOptions,
  RAGResult,
  GuardRails,
  WebAutomationConfig,
  DirectAgentOptions,
  DirectAgentResult,
  MCPToolConfig,
  MCPDiscoveredTool,
  CostTracker,
  createEmbeddings,
  processPDFWithEmbeddings,
  queryWithEmbeddings,
  findRelevantChunks,
  SimpleRAG,
};

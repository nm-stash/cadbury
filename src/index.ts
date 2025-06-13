// Main library exports
import { HumanMessage } from "@langchain/core/messages";
import { CadburyWorkflow } from "./graph";
import { CadburyChain } from "./cadbury";
import { createAgent } from "./agent";
import { createChartTool, createTavilyTool } from "./tools";
import {
  CadburyConfig,
  AgentConfig,
  StreamResult,
  CadburyResponse,
  WorkflowOptions,
} from "./types";

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
  const chartUrls: string[] = [];

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
            const value = output[key];
            if (value && value.messages && value.messages.length > 0) {
              value.messages.forEach((msg: { content: string }) => {
                messages.push(msg.content);
                // Extract chart URLs if present
                const chartUrlMatch = msg.content.match(/https:\/\/[^\s]+/g);
                if (chartUrlMatch) {
                  chartUrls.push(...chartUrlMatch);
                }
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

    if (result.messages) {
      result.messages.forEach((msg: { content: string }) => {
        messages.push(msg.content);
        // Extract chart URLs if present
        const chartUrlMatch = msg.content.match(/https:\/\/[^\s]+/g);
        if (chartUrlMatch) {
          chartUrls.push(...chartUrlMatch);
        }
      });
    }
  }

  return {
    messages,
    chartUrls: chartUrls.length > 0 ? chartUrls : undefined,
    isComplete: true,
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

// Export all types and classes for advanced usage
export {
  CadburyWorkflow,
  CadburyChain,
  createAgent,
  createChartTool,
  createTavilyTool,
  CadburyConfig,
  AgentConfig,
  StreamResult,
  CadburyResponse,
  WorkflowOptions,
};

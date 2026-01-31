import { AgentExecutor, createOpenAIToolsAgent } from "@langchain/classic/agents";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { DynamicStructuredTool } from "@langchain/core/tools";

export interface CreateAgentOptions {
  onToolCall?: (toolName: string, input: any) => Promise<boolean>;
  maxIterations?: number;
}

/**
 * Wraps a tool with middleware that intercepts each call.
 * If onToolCall returns false, the tool returns a stop signal instead of executing.
 */
function wrapToolWithMiddleware(
  tool: any,
  onToolCall: (toolName: string, input: any) => Promise<boolean>
): any {
  const originalFunc = tool.func.bind(tool);
  return new DynamicStructuredTool({
    name: tool.name,
    description: tool.description,
    schema: tool.schema,
    func: async (input: any) => {
      const shouldContinue = await onToolCall(tool.name, input);
      if (!shouldContinue) {
        return "EXECUTION_STOPPED: Tool call limit or credit limit reached. Stop executing and provide your final answer based on information gathered so far.";
      }
      return originalFunc(input);
    },
  });
}

export async function createAgent(
  llm: any,
  tools: any[],
  systemPrompt: string,
  options?: CreateAgentOptions
): Promise<any> {
  // If onToolCall provided, wrap each tool with the middleware
  const effectiveTools = options?.onToolCall
    ? tools.map((tool) => wrapToolWithMiddleware(tool, options.onToolCall!))
    : tools;

  // Each worker node will be given a name and some tools.
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("messages"),
    new MessagesPlaceholder("agent_scratchpad"),
  ]);
  const agent = await createOpenAIToolsAgent({
    llm,
    tools: effectiveTools,
    prompt,
  });
  return new AgentExecutor({
    agent,
    tools: effectiveTools,
    maxIterations: options?.maxIterations,
  });
}

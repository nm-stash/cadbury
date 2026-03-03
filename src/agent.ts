import { AgentExecutor, createOpenAIToolsAgent } from "@langchain/classic/agents";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  BaseMessage,
} from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { AgentFrame, AgentStack } from "./types";

// Simple UUID generator (avoids external dependency)
function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface CreateAgentOptions {
  onToolCall?: (toolName: string, input: any) => Promise<boolean>;
  maxIterations?: number;
}

export interface AgentLoopOptions extends CreateAgentOptions {
  onThinking?: (content: string, iteration: number) => void;
  onToolResult?: (
    toolName: string,
    input: any,
    output: any,
    durationMs: number
  ) => void;
  onFrame?: (frame: AgentFrame) => void;
}

export interface AgentLoopResult {
  messages: BaseMessage[];
  output: string;
  intermediateSteps: Array<{
    action: { tool: string; toolInput: Record<string, any> };
    observation: string;
  }>;
  stack: AgentStack;
}

/**
 * Wraps a tool with middleware that intercepts each call.
 * If onToolCall returns false, the tool returns a stop signal instead of executing.
 */
function wrapToolWithMiddleware(
  tool: any,
  onToolCall: (toolName: string, input: any) => Promise<boolean>
): any {
  const originalInvoke = tool.invoke.bind(tool);
  return new DynamicStructuredTool({
    name: tool.name,
    description: tool.description,
    schema: tool.schema,
    func: async (input: any) => {
      const shouldContinue = await onToolCall(tool.name, input);
      if (!shouldContinue) {
        return "EXECUTION_STOPPED: Tool call limit or credit limit reached. Stop executing and provide your final answer based on information gathered so far.";
      }
      // Use invoke (not func) to preserve any upstream wrappers (e.g. onToolResult)
      return originalInvoke(input);
    },
  });
}

/**
 * Legacy agent creation using AgentExecutor.
 * Kept for backward compatibility with multi-agent workflow.
 */
export async function createAgentLegacy(
  llm: any,
  tools: any[],
  systemPrompt: string,
  options?: CreateAgentOptions
): Promise<any> {
  const effectiveTools = options?.onToolCall
    ? tools.map((tool) => wrapToolWithMiddleware(tool, options.onToolCall!))
    : tools;

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

// Keep original export name for backward compat (used by graph.ts for multi-agent workflow)
export const createAgent = createAgentLegacy;

/**
 * Custom ReAct agent loop with full observability.
 *
 * Instead of using LangChain's AgentExecutor (black box), this implements
 * a transparent loop that captures the LLM's chain-of-thought at every step.
 *
 * Flow per iteration:
 *   1. Call LLM with messages + tool definitions
 *   2. If LLM returns content (text) → emit "thinking" frame
 *   3. If LLM requests tool_calls → execute each, emit frames
 *   4. If no tool_calls → final response, break
 */
export async function createAgentLoop(
  llm: any,
  tools: any[],
  systemPrompt: string,
  options?: AgentLoopOptions
): Promise<{ invoke: (input: { messages: BaseMessage[] }) => Promise<AgentLoopResult> }> {
  const maxIterations = options?.maxIterations || 10;

  // Bind tools to the LLM so it knows the available tool schemas
  const llmWithTools = tools.length > 0 ? llm.bindTools(tools) : llm;

  // Build a tool lookup map for execution
  const toolMap = new Map<string, any>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  return {
    invoke: async (input: { messages: BaseMessage[] }): Promise<AgentLoopResult> => {
      const frames: AgentFrame[] = [];
      const intermediateSteps: Array<{
        action: { tool: string; toolInput: Record<string, any> };
        observation: string;
      }> = [];

      const stack: AgentStack = {
        frames,
        status: "running",
        startedAt: new Date(),
        iterationCount: 0,
        model: llm.modelName || llm.model || "unknown",
      };

      // Build conversation messages
      const messages: BaseMessage[] = [
        new SystemMessage(systemPrompt),
        ...input.messages,
      ];

      let finalOutput = "";

      for (let iteration = 0; iteration < maxIterations; iteration++) {
        stack.iterationCount = iteration + 1;

        // Call the LLM
        let aiMessage: AIMessage;
        try {
          aiMessage = await llmWithTools.invoke(messages);
        } catch (error: any) {
          const errorFrame: AgentFrame = {
            id: generateId(),
            type: "error",
            timestamp: new Date(),
            content: `LLM call failed: ${error.message}`,
            metadata: { iteration },
          };
          frames.push(errorFrame);
          options?.onFrame?.(errorFrame);

          stack.status = "error";
          stack.completedAt = new Date();
          stack.totalDurationMs =
            stack.completedAt.getTime() - stack.startedAt.getTime();
          finalOutput =
            "I encountered an error while processing your request. Please try again.";
          break;
        }

        // Extract token usage from response metadata if available
        const tokenUsage = (aiMessage as any).usage_metadata
          ? {
              input: (aiMessage as any).usage_metadata.input_tokens || 0,
              output: (aiMessage as any).usage_metadata.output_tokens || 0,
            }
          : undefined;

        // Check if the LLM produced reasoning text (content before/with tool calls)
        const contentText =
          typeof aiMessage.content === "string"
            ? aiMessage.content
            : Array.isArray(aiMessage.content)
            ? aiMessage.content
                .filter((c: any) => c.type === "text")
                .map((c: any) => c.text)
                .join("")
            : "";

        const toolCalls = aiMessage.tool_calls || [];

        if (toolCalls.length > 0) {
          // Agent is thinking + calling tools

          // Emit thinking frame if there's reasoning content
          if (contentText.trim()) {
            const thinkingFrame: AgentFrame = {
              id: generateId(),
              type: "thinking",
              timestamp: new Date(),
              content: contentText.trim(),
              metadata: { iteration, tokenUsage },
            };
            frames.push(thinkingFrame);
            options?.onFrame?.(thinkingFrame);
            options?.onThinking?.(contentText.trim(), iteration);
          }

          // Append the AI message to conversation
          messages.push(aiMessage);

          // Execute each tool call
          for (const toolCall of toolCalls) {
            const toolName = toolCall.name;
            const toolInput = toolCall.args || {};
            const toolCallId = toolCall.id;

            // Emit tool_call frame
            const toolCallFrame: AgentFrame = {
              id: generateId(),
              type: "tool_call",
              timestamp: new Date(),
              content: toolName,
              metadata: { toolName, toolInput, iteration },
            };
            frames.push(toolCallFrame);
            options?.onFrame?.(toolCallFrame);

            // Check onToolCall middleware (can stop execution)
            if (options?.onToolCall) {
              const shouldContinue = await options.onToolCall(
                toolName,
                toolInput
              );
              if (!shouldContinue) {
                const stopOutput =
                  "EXECUTION_STOPPED: Tool call limit or credit limit reached.";
                const toolResultFrame: AgentFrame = {
                  id: generateId(),
                  type: "tool_result",
                  timestamp: new Date(),
                  durationMs: 0,
                  content: stopOutput,
                  metadata: {
                    toolName,
                    toolInput,
                    toolOutput: stopOutput,
                    iteration,
                  },
                };
                frames.push(toolResultFrame);
                options?.onFrame?.(toolResultFrame);

                messages.push(
                  new ToolMessage({
                    content: stopOutput,
                    tool_call_id: toolCallId!,
                  })
                );
                intermediateSteps.push({
                  action: { tool: toolName, toolInput },
                  observation: stopOutput,
                });
                continue;
              }
            }

            // Execute the tool
            const toolStartTime = Date.now();
            let toolOutput: string;
            try {
              const tool = toolMap.get(toolName);
              if (!tool) {
                toolOutput = `Error: Tool "${toolName}" not found`;
              } else {
                const result = await tool.invoke(toolInput);
                toolOutput =
                  typeof result === "string" ? result : JSON.stringify(result);
              }
            } catch (error: any) {
              toolOutput = `Error executing tool: ${error.message}`;
              const errorFrame: AgentFrame = {
                id: generateId(),
                type: "error",
                timestamp: new Date(),
                content: `Tool "${toolName}" failed: ${error.message}`,
                metadata: { toolName, toolInput, iteration },
              };
              frames.push(errorFrame);
              options?.onFrame?.(errorFrame);
            }

            const toolDurationMs = Date.now() - toolStartTime;

            // Emit tool_result frame
            const toolResultFrame: AgentFrame = {
              id: generateId(),
              type: "tool_result",
              timestamp: new Date(),
              durationMs: toolDurationMs,
              content: toolOutput,
              metadata: {
                toolName,
                toolInput,
                toolOutput,
                iteration,
              },
            };
            frames.push(toolResultFrame);
            options?.onFrame?.(toolResultFrame);
            options?.onToolResult?.(
              toolName,
              toolInput,
              toolOutput,
              toolDurationMs
            );

            // Append tool result to conversation
            messages.push(
              new ToolMessage({
                content: toolOutput,
                tool_call_id: toolCallId!,
              })
            );

            intermediateSteps.push({
              action: { tool: toolName, toolInput },
              observation: toolOutput,
            });
          }

          // Continue to next iteration (LLM will see tool results)
        } else {
          // No tool calls — this is the final response
          finalOutput = contentText;

          const responseFrame: AgentFrame = {
            id: generateId(),
            type: "response",
            timestamp: new Date(),
            content: finalOutput,
            metadata: { iteration, tokenUsage },
          };
          frames.push(responseFrame);
          options?.onFrame?.(responseFrame);

          stack.status = "completed";
          stack.completedAt = new Date();
          stack.totalDurationMs =
            stack.completedAt.getTime() - stack.startedAt.getTime();
          break;
        }

        // If we've hit max iterations, force completion
        if (iteration === maxIterations - 1) {
          stack.status = "completed";
          stack.completedAt = new Date();
          stack.totalDurationMs =
            stack.completedAt.getTime() - stack.startedAt.getTime();

          if (!finalOutput) {
            finalOutput =
              "I've reached my maximum number of steps. Here's what I've gathered so far based on my tool calls.";
          }
        }
      }

      // Ensure stack is finalized
      if (!stack.completedAt) {
        stack.status = "completed";
        stack.completedAt = new Date();
        stack.totalDurationMs =
          stack.completedAt.getTime() - stack.startedAt.getTime();
      }

      return {
        messages,
        output: finalOutput,
        intermediateSteps,
        stack,
      };
    },
  };
}

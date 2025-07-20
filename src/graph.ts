import { RunnableConfig } from "@langchain/core/runnables";
import { createAgent } from "./agent";
import { CadburyChain } from "./cadbury";
import {
  createTavilyTool,
  createTextAnalysisTool,
  createCalculatorTool,
} from "./tools";
import { createWebAgent } from "./web-agent";
import { AgentStateChannels, agentStateChannels } from "./state";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { START, StateGraph, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { CadburyConfig, AgentConfig } from "./types";

type NodeName = "cadbury" | "web_agent" | "researcher" | string;

export class CadburyWorkflow {
  private llm: ChatOpenAI;
  private workflow: StateGraph<AgentStateChannels>;
  private cadburyChain: CadburyChain;
  private config: CadburyConfig;
  private customAgents: Map<string, any> = new Map();

  constructor(config: CadburyConfig) {
    this.config = config;
    this.workflow = new StateGraph({
      channels: agentStateChannels,
    });
    this.cadburyChain = new CadburyChain(config);
    
    if (!this.cadburyChain.llm) {
      throw new Error("OpenAI API key is required for CadburyWorkflow");
    }
    this.llm = this.cadburyChain.llm;
  }

  public getCostTracker() {
    return this.cadburyChain.costTracker;
  }

  public async addCustomAgent(agentConfig: AgentConfig) {
    const agent = await createAgent(
      this.llm,
      agentConfig.tools || [],
      agentConfig.systemPrompt
    );
    this.customAgents.set(agentConfig.name, agent);

    // Update the members list to include custom agents
    if (!CadburyChain.members.includes(agentConfig.name)) {
      CadburyChain.members.push(agentConfig.name);
    }
  }

  private cadburyNode = async (
    state: AgentStateChannels,
    config?: RunnableConfig
  ) => {
    const messages = state.messages || [];
    const lastMessage = messages[messages.length - 1];

    // Check if this is the initial request
    if (messages.length === 1 && lastMessage?.content) {
      const userRequest =
        typeof lastMessage.content === "string"
          ? lastMessage.content
          : JSON.stringify(lastMessage.content);

      // Check if this is a simple greeting or can be handled directly
      if (this.isSimpleRequest(userRequest)) {
        const directResponse = await this.cadburyChain.provideDirectResponse(
          userRequest
        );

        return {
          messages: [
            new AIMessage({
              content: directResponse,
              name: "Cadbury",
            }),
          ],
          next: END,
        };
      }

      // For complex requests, analyze and create specialized agents
      const plan = await this.cadburyChain.analyzeAndPlan(userRequest);

      // Add the plan to the conversation
      const planMessage = new AIMessage({
        content: `I understand your request. Here's my plan:\n\n${plan}\n\nLet me get started...`,
        name: "Cadbury",
      });

      // Get the suggested agent from task analysis
      const activeAgents = this.cadburyChain.getActiveAgents();
      if (activeAgents.length > 0) {
        // Use the first suggested agent
        const nextAgent = activeAgents[0];

        return {
          messages: [planMessage],
          next: nextAgent,
        };
      } else {
        // Fallback to direct handling
        return {
          messages: [planMessage],
          next: END,
        };
      }
    }

    // If we have agent responses, process them
    const agentResponses = messages
      .filter((msg) => msg.name && msg.name !== "Cadbury")
      .map((msg) => ({
        agent: msg.name!,
        response:
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content),
      }));

    if (agentResponses.length > 0) {
      const userRequestMsg = messages.find((msg) => !msg.name);
      const userRequest = userRequestMsg?.content
        ? typeof userRequestMsg.content === "string"
          ? userRequestMsg.content
          : JSON.stringify(userRequestMsg.content)
        : "";

      // Synthesize final response - don't keep calling more agents unless really needed
      const finalResponse = await this.cadburyChain.synthesizeResponse(
        userRequest,
        agentResponses
      );

      return {
        messages: [
          new AIMessage({
            content: finalResponse,
            name: "Cadbury",
          }),
        ],
        next: END,
      };
    }

    // Default case - provide direct response
    const userRequestMsg = messages.find((msg) => !msg.name);
    const userRequest = userRequestMsg?.content
      ? typeof userRequestMsg.content === "string"
        ? userRequestMsg.content
        : JSON.stringify(userRequestMsg.content)
      : "";
    const directResponse = await this.cadburyChain.provideDirectResponse(
      userRequest
    );

    return {
      messages: [
        new AIMessage({
          content: directResponse,
          name: "Cadbury",
        }),
      ],
      next: END,
    };
  };

  private isSimpleRequest(request: string): boolean {
    const simplePatterns = [
      /^(hi|hello|hey|greetings?|good\s+(morning|afternoon|evening|day))[\s\.\!]*$/i,
      /^(how\s+are\s+you|what'?s\s+up|howdy)[\s\.\!]*$/i,
      /^(thanks?|thank\s+you|bye|goodbye|see\s+you)[\s\.\!]*$/i,
      /^(test|testing)[\s\.\!]*$/i,
      /^.{1,10}$/, // Very short messages (likely greetings)
    ];

    return simplePatterns.some((pattern) => pattern.test(request.trim()));
  }

  private createDynamicAgentNode = (agentName: string) => {
    return async (state: AgentStateChannels, config?: RunnableConfig) => {
      // Get or create the agent dynamically
      const agent = await this.cadburyChain.getOrCreateAgent(agentName);

      if (!agent) {
        throw new Error(`Failed to create agent: ${agentName}`);
      }

      const result = await agent.invoke(state, config);
      return {
        messages: [
          new HumanMessage({ content: result.output, name: agentName }),
        ],
      };
    };
  };

  private async rebuildWorkflowWithAgents() {
    // Get the current active agents
    const activeAgents = this.cadburyChain.getActiveAgents();

    // Add any new agent nodes that don't exist yet
    for (const agentName of activeAgents) {
      try {
        // Try to add the node - this will fail silently if it already exists
        this.workflow.addNode(
          agentName as any,
          this.createDynamicAgentNode(agentName)
        );

        // Add edge from agent back to Cadbury
        this.workflow.addEdge(agentName as any, "cadbury" as any);
      } catch (error: any) {
        // Node might already exist, which is fine
        console.log(
          `Node ${agentName} might already exist:`,
          error?.message || error
        );
      }
    }
  }

  private async setupWorkflow() {
    // Add Cadbury as the central node
    this.workflow.addNode("cadbury", this.cadburyNode);

    // Pre-create common agent nodes
    this.workflow.addNode(
      "web_agent",
      this.createDynamicAgentNode("web_agent")
    );
    this.workflow.addNode(
      "researcher",
      this.createDynamicAgentNode("researcher")
    );

    // Start with Cadbury
    this.workflow.addEdge(START, "cadbury" as any);

    // Add edges from common agents back to Cadbury
    this.workflow.addEdge("web_agent" as any, "cadbury" as any);
    this.workflow.addEdge("researcher" as any, "cadbury" as any);

    // Add conditional edges from Cadbury
    this.workflow.addConditionalEdges(
      "cadbury" as any,
      (x: AgentStateChannels) => x.next || END
    );
  }

  public async initialize() {
    // No need to initialize predefined agents - they'll be created dynamically
    await this.setupWorkflow();
  }

  public getWorkflow() {
    return this.workflow.compile();
  }
}

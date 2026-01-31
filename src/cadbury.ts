import { END } from "@langchain/langgraph";
import { JsonOutputToolsParser } from "@langchain/core/output_parsers/openai_tools";
import { ChatOpenAI } from "@langchain/openai";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { CadburyConfig, PersonalityConfig, TaskAnalysis } from "./types";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { CostTracker } from "./cost-tracker";
import { IntelligentAgentManager } from "./agent-manager";

export class CadburyChain {
  public static members: string[] = []; // Dynamic members
  private static systemPrompt =
    "You are {supervisorName}, an intelligent AI butler and task manager. You excel at understanding user requests, " +
    "analyzing what capabilities are needed, and creating specialized agents dynamically to handle tasks. {personalityInstructions} " +
    "Your enhanced workflow: " +
    "1. Analyze the user's request to understand the task type and required capabilities " +
    "2. Determine the best approach (web automation, search APIs, or both) " +
    "3. Create specialized agents dynamically based on the task requirements " +
    "4. If you can handle simple tasks directly, provide a direct response " +
    "5. After receiving agent responses, synthesize and provide the final response " +
    "When delegating, respond with the agent name. When finished or handling directly, respond with FINISH. " +
    "You prioritize web automation over search APIs when: " +
    "- Specific website navigation is needed " +
    "- Real-time data extraction is required " +
    "- Forms need to be filled " +
    "- Interactive elements need to be manipulated " +
    "- Information is behind registration walls " +
    "You create agents on-demand based on task requirements rather than using pre-defined ones.";
  private static options = [END, ...CadburyChain.members];

  private static functionDef = {
    name: "route",
    description: "Select the next role.",
    parameters: {
      title: "routeSchema",
      type: "object",
      properties: {
        next: {
          title: "Next",
          anyOf: [{ enum: CadburyChain.options }],
        },
      },
      required: ["next"],
    },
  };

  private static toolDef = {
    type: "function",
    function: CadburyChain.functionDef,
  } as const;

  private static prompt = ChatPromptTemplate.fromMessages([
    ["system", CadburyChain.systemPrompt],
    new MessagesPlaceholder("messages"),
    [
      "system",
      "Based on the conversation above and the task analysis, what should you do next? " +
        "Available agents have been dynamically created based on the task requirements. " +
        "Select the most appropriate agent for the next step, or FINISH if you can handle it directly. " +
        "Current available options: {options}",
    ],
  ]);

  public llm?: ChatOpenAI;
  private config: CadburyConfig;
  private personalityPrompt: string;
  private supervisorName: string;
  public costTracker: CostTracker;
  private agentManager: IntelligentAgentManager;
  private currentTaskAnalysis: TaskAnalysis | null = null;

  constructor(config: CadburyConfig) {
    this.config = config;
    this.supervisorName = config.personality?.supervisorName || "Cadbury";
    this.personalityPrompt = this.generatePersonalityPrompt(config.personality);
    this.costTracker = new CostTracker(config.modelName || "gpt-3.5-turbo");
    this.agentManager = new IntelligentAgentManager(config);

    // Only initialize LLM if API key is provided
    if (config.openaiApiKey) {
      this.llm = new ChatOpenAI({
        apiKey: config.openaiApiKey,
        modelName: config.modelName || "gpt-3.5-turbo",
        temperature: config.temperature || 0,
      });
    }
  }

  public async analyzeAndPlan(userRequest: string): Promise<string> {
    // Analyze the task to determine what agents are needed
    this.currentTaskAnalysis = await this.agentManager.analyzeTask(userRequest);

    // Actually create the suggested agents
    for (const agentCapability of this.currentTaskAnalysis.suggestedAgents) {
      await this.agentManager.createDynamicAgent(agentCapability);
    }

    // Update available members based on analysis
    CadburyChain.members = this.currentTaskAnalysis.suggestedAgents.map(
      (agent) => agent.name
    );

    // Generate dynamic options
    const options = [END, ...CadburyChain.members];

    // Update the function definition with current options
    CadburyChain.functionDef.parameters.properties.next.anyOf = [
      { enum: options },
    ];

    const planPrompt = `Based on my analysis of your request: "${userRequest}"

Task Analysis:
- Task Type: ${this.currentTaskAnalysis.taskType}
- Required Capabilities: ${this.currentTaskAnalysis.requiredCapabilities.join(
      ", "
    )}
- Suggested Approach: ${this.currentTaskAnalysis.reasoning}

I will create the following specialized agents:
${this.currentTaskAnalysis.suggestedAgents
  .map((agent) => `- ${agent.name}: ${agent.description}`)
  .join("\n")}

This approach will be more effective than using generic agents because it's tailored specifically to your task requirements.`;

    return planPrompt;
  }

  public getActiveAgents(): string[] {
    return this.agentManager.getActiveAgents();
  }

  public async getOrCreateAgent(agentName: string): Promise<any> {
    const capability = this.currentTaskAnalysis?.suggestedAgents.find(
      (agent) => agent.name === agentName
    );

    return await this.agentManager.getOrCreateAgent(agentName, capability);
  }

  private generatePersonalityPrompt(personality?: PersonalityConfig): string {
    const basePersonality = `You are ${this.supervisorName}, an intelligent AI supervisor who manages a team of specialized agents to accomplish complex tasks efficiently.

You coordinate with different agents based on task requirements:
- Web automation agents for browser-based tasks
- Research agents for information gathering
- Other specialized agents as needed

You are direct, efficient, and focused on delivering results while maintaining a professional demeanor.`;

    // If custom personality is provided, use it with supervisor name
    if (personality?.customPersonality) {
      return `You are ${this.supervisorName}. ${personality.customPersonality}`;
    }

    return basePersonality;
  }

  public async createPlan(userRequest: string): Promise<string> {
    if (!this.llm) {
      throw new Error("OpenAI API key is required for plan creation");
    }

    const planningPrompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are Cadbury, an intelligent AI butler. Analyze user requests and create clear, step-by-step action plans. ${this.personalityPrompt} Explain what you'll do and which agents (if any) you'll need to involve.`,
      ],
      ["human", "{request}"],
    ]);

    const formattedMessages = await planningPrompt.formatMessages({
      request: userRequest,
    });

    // Track input tokens
    const inputTokens = CostTracker.estimateTokens(
      formattedMessages
        .map((m) =>
          typeof m.content === "string"
            ? m.content
            : Array.isArray(m.content)
            ? m.content.join(" ")
            : typeof m.content === "object"
            ? JSON.stringify(m.content)
            : String(m.content)
        )
        .join(" ")
    );

    const response = await this.llm.invoke(formattedMessages);

    // Track output tokens
    const outputTokens = CostTracker.estimateTokens(response.content as string);
    this.costTracker.trackTokens(inputTokens, outputTokens);

    return response.content as string;
  }

  public async provideDirectResponse(
    userRequest: string,
    context?: string
  ): Promise<string> {
    if (!this.llm) {
      throw new Error("OpenAI API key is required for direct responses");
    }

    const responsePrompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are Cadbury, an intelligent AI butler. Provide helpful, direct responses to user requests. ${this.personalityPrompt} You are knowledgeable and can handle many tasks without needing specialized agents.`,
      ],
      context
        ? ["assistant", "Previous context from my team: {context}"]
        : ["assistant", ""],
      ["human", "{request}"],
    ]);

    const formattedMessages = await responsePrompt.formatMessages({
      request: userRequest,
      context: context || "",
    });

    // Track input tokens
    const inputTokens = CostTracker.estimateTokens(
      formattedMessages.map((m) => m.content).join(" ")
    );

    const response = await this.llm.invoke(formattedMessages);

    // Track output tokens
    const outputTokens = CostTracker.estimateTokens(response.content as string);
    this.costTracker.trackTokens(inputTokens, outputTokens);

    return response.content as string;
  }

  public async synthesizeResponse(
    userRequest: string,
    agentResponses: Array<{ agent: string; response: string }>
  ): Promise<string> {
    if (!this.llm) {
      throw new Error("OpenAI API key is required for response synthesis");
    }

    const synthesisPrompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are Cadbury, an intelligent AI butler. Synthesize responses from your agents into a comprehensive, helpful final response for the user. ${this.personalityPrompt} Transform the information into an engaging and useful answer.`,
      ],
      [
        "human",
        "Original request: {request}\n\nAgent responses:\n{responses}\n\nProvide a clear, final response to the user:",
      ],
    ]);

    const responsesText = agentResponses
      .map((ar) => `${ar.agent}: ${ar.response}`)
      .join("\n\n");

    const formattedMessages = await synthesisPrompt.formatMessages({
      request: userRequest,
      responses: responsesText,
    });

    // Track input tokens
    const inputTokens = CostTracker.estimateTokens(
      formattedMessages.map((m) => m.content).join(" ")
    );

    const response = await this.llm.invoke(formattedMessages);

    // Track output tokens
    const outputTokens = CostTracker.estimateTokens(response.content as string);
    this.costTracker.trackTokens(inputTokens, outputTokens);

    return response.content as string;
  }

  public async getCadburyChain() {
    if (!this.llm) {
      throw new Error("OpenAI API key is required for creating Cadbury chain");
    }

    // Create a dynamic prompt with current available agents
    const currentMembers =
      CadburyChain.members.length > 0 ? CadburyChain.members : ["FINISH"];
    const currentOptions = [END, ...currentMembers];

    const dynamicPrompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        CadburyChain.systemPrompt
          .replace("{personalityInstructions}", this.personalityPrompt)
          .replace("{members}", currentMembers.join(", "))
          .replace("{supervisorName}", this.supervisorName),
      ],
      new MessagesPlaceholder("messages"),
      [
        "system",
        `Based on the conversation above and the task analysis, what should you do next? 
        Available agents have been dynamically created based on the task requirements. 
        Select the most appropriate agent for the next step, or FINISH if you can handle it directly. 
        Current available options: ${currentOptions.join(", ")}`,
      ],
    ]);

    const llmWithTools = this.llm.bindTools([CadburyChain.toolDef]);
    const chain = dynamicPrompt
      .pipe(llmWithTools)
      .pipe(new JsonOutputToolsParser())
      .pipe((x: any) => x[0]?.args);

    return chain;
  }
}

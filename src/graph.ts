import { RunnableConfig } from "@langchain/core/runnables";
import { createAgent } from "./agent";
import { CadburyChain } from "./cadbury";
import { createChartTool, createTavilyTool } from "./tools";
import { AgentStateChannels, agentStateChannels } from "./state";
import { HumanMessage } from "@langchain/core/messages";
import { START, StateGraph, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { CadburyConfig, AgentConfig } from "./types";

export class CadburyWorkflow {
  private llm: ChatOpenAI;
  private researcherAgent: any;
  private chartGenAgent: any;
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
    this.llm = this.cadburyChain.llm;
  }

  private async initializeAgents() {
    const tavilyTool = this.config.tavilyApiKey
      ? createTavilyTool(this.config.tavilyApiKey)
      : null;
    const chartTool = createChartTool();

    this.researcherAgent = await createAgent(
      this.llm,
      tavilyTool ? [tavilyTool] : [],
      "You are a web researcher. You may use the Tavily search engine to search the web for" +
        " important information, so the Chart Generator in your team can make useful plots."
    );

    this.chartGenAgent = await createAgent(
      this.llm,
      [chartTool],
      "You excel at generating bar charts. Use the researcher's information to generate the charts."
    );
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

  private researcherNode = async (
    state: AgentStateChannels,
    config?: RunnableConfig
  ) => {
    const result = await this.researcherAgent.invoke(state, config);
    return {
      messages: [
        new HumanMessage({ content: result.output, name: "Researcher" }),
      ],
    };
  };

  private chartGenNode = async (
    state: AgentStateChannels,
    config?: RunnableConfig
  ) => {
    const result = await this.chartGenAgent.invoke(state, config);
    return {
      messages: [
        new HumanMessage({ content: result.output, name: "ChartGenerator" }),
      ],
    };
  };

  private createCustomAgentNode = (agentName: string) => {
    return async (state: AgentStateChannels, config?: RunnableConfig) => {
      const agent = this.customAgents.get(agentName);
      if (!agent) {
        throw new Error(`Agent ${agentName} not found`);
      }
      const result = await agent.invoke(state, config);
      return {
        messages: [
          new HumanMessage({ content: result.output, name: agentName }),
        ],
      };
    };
  };

  private async setupWorkflow() {
    const cadburyChain = await this.cadburyChain.getCadburyChain();

    this.workflow
      .addNode("researcher", this.researcherNode)
      .addNode("chart_generator", this.chartGenNode)
      .addNode("cadbury", cadburyChain);

    // Add custom agent nodes
    for (const [agentName] of this.customAgents) {
      this.workflow.addNode(agentName, this.createCustomAgentNode(agentName));
    }

    // Add edges from each worker to cadbury
    CadburyChain.members.forEach((member) => {
      // @ts-ignore - LangGraph type definitions are stricter than runtime
      this.workflow.addEdge(member, "cadbury");
    });

    // Add edges from custom agents to cadbury
    for (const [agentName] of this.customAgents) {
      // @ts-ignore - LangGraph type definitions are stricter than runtime
      this.workflow.addEdge(agentName, "cadbury");
    }

    // @ts-ignore - LangGraph type definitions are stricter than runtime
    this.workflow.addConditionalEdges(
      // @ts-ignore
      "cadbury",
      (x: AgentStateChannels) => x.next
    );
    // @ts-ignore - LangGraph type definitions are stricter than runtime
    this.workflow.addEdge(START, "cadbury");
  }

  public async initialize() {
    await this.initializeAgents();
    await this.setupWorkflow();
  }

  public getWorkflow() {
    return this.workflow.compile();
  }
}

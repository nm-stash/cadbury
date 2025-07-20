import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "./agent";
import { createWebTool, createTavilyTool } from "./tools";
import { CadburyConfig, TaskAnalysis, AgentCapability } from "./types";

export class IntelligentAgentManager {
  private llm: ChatOpenAI;
  private config: CadburyConfig;
  private activeAgents: Map<string, any> = new Map();
  private availableTools: Map<string, any> = new Map();

  constructor(config: CadburyConfig) {
    this.config = config;
    this.llm = new ChatOpenAI({
      apiKey: config.openaiApiKey,
      modelName: config.modelName || "gpt-4",
      temperature: config.temperature || 0.1,
    });

    // Initialize available tools
    this.initializeTools();
  }

  private initializeTools() {
    // Web automation tool
    this.availableTools.set(
      "web_automation",
      createWebTool(this.config.webAutomation)
    );

    // Research tool (if API key available)
    if (this.config.tavilyApiKey) {
      this.availableTools.set(
        "tavily_search",
        createTavilyTool(this.config.tavilyApiKey)
      );
    }
  }

  async analyzeTask(userRequest: string): Promise<TaskAnalysis> {
    const analysisPrompt = `
You are an intelligent task analyzer. Analyze the following user request and determine the best approach.

User Request: "${userRequest}"

Consider:
- Web automation (Puppeteer) is better for: specific website navigation, form filling, data extraction from specific pages, interactive tasks, real-time data
- Search APIs (Tavily) are better for: quick information lookup, summarizing multiple sources, general research questions
- Both might be needed for complex research tasks

Respond ONLY with valid JSON in this exact format:
{
  "taskType": "web_automation",
  "requiredCapabilities": ["web_navigation", "data_extraction"],
  "suggestedAgents": [
    {
      "name": "web_agent",
      "description": "Navigate websites and extract information using browser automation",
      "tools": ["web_automation"],
      "systemPrompt": "You are an intelligent Web Automation Agent. Navigate websites, extract data, and interact with web pages. Always start by understanding the page structure, use intelligent selectors, and provide clear feedback on your actions."
    }
  ],
  "reasoning": "This task requires direct website interaction and data extraction, which is best handled by web automation"
}`;

    try {
      const response = await this.llm.invoke(analysisPrompt);
      const content = response.content as string;

      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        return analysis as TaskAnalysis;
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (error) {
      console.log(
        "Task analysis parsing failed, using web automation fallback:",
        error
      );

      // Improved fallback based on keywords
      const isWebTask =
        /navigate|website|page|form|click|extract|scrape|browse/i.test(
          userRequest
        );
      const isResearchTask = /search|find|research|information|news|data/i.test(
        userRequest
      );

      if (
        isWebTask ||
        userRequest.includes(".com") ||
        userRequest.includes("http")
      ) {
        return {
          taskType: "web_automation",
          requiredCapabilities: ["web_navigation", "data_extraction"],
          suggestedAgents: [
            {
              name: "web_agent",
              description: "Navigate websites and extract information",
              tools: ["web_automation"],
              systemPrompt: this.getDefaultWebAgentPrompt(),
            },
          ],
          reasoning:
            "Detected web-related keywords or URLs, using web automation",
        };
      } else if (isResearchTask && this.config.tavilyApiKey) {
        return {
          taskType: "research",
          requiredCapabilities: ["web_search", "information_gathering"],
          suggestedAgents: [
            {
              name: "researcher",
              description: "Search for information using web search APIs",
              tools: ["tavily_search"],
              systemPrompt:
                "You are a research agent. Use web search to find current, accurate information and provide comprehensive results with sources.",
            },
          ],
          reasoning: "Detected research keywords, using search API",
        };
      } else {
        // Default to web automation as it's more capable
        return {
          taskType: "web_automation",
          requiredCapabilities: ["web_navigation", "data_extraction"],
          suggestedAgents: [
            {
              name: "web_agent",
              description: "Navigate websites and extract information",
              tools: ["web_automation"],
              systemPrompt: this.getDefaultWebAgentPrompt(),
            },
          ],
          reasoning:
            "Using web automation as default - more capable than search APIs",
        };
      }
    }
  }

  async createDynamicAgent(capability: AgentCapability): Promise<any> {
    const tools = capability.tools
      .map((toolName) => this.availableTools.get(toolName))
      .filter((tool) => tool !== undefined);

    const agent = await createAgent(this.llm, tools, capability.systemPrompt);
    this.activeAgents.set(capability.name, agent);

    return agent;
  }

  async getOrCreateAgent(
    agentName: string,
    capability?: AgentCapability
  ): Promise<any> {
    if (this.activeAgents.has(agentName)) {
      return this.activeAgents.get(agentName);
    }

    if (capability) {
      return await this.createDynamicAgent(capability);
    }

    // Fallback to default web agent
    const defaultCapability: AgentCapability = {
      name: agentName,
      description: "Default web automation agent",
      tools: ["web_automation"],
      systemPrompt: this.getDefaultWebAgentPrompt(),
    };

    return await this.createDynamicAgent(defaultCapability);
  }

  private getDefaultWebAgentPrompt(): string {
    return `You are an intelligent Web Automation Agent with advanced capabilities for navigating and interacting with websites.

Your core strengths:
- Navigate to any website and understand its structure
- Extract specific data from web pages with precision
- Fill forms and interact with web elements
- Handle dynamic content and modern web applications
- Take screenshots and provide visual feedback
- Pause for human intervention when needed (login, CAPTCHA, 2FA)

Advanced capabilities:
- Analyze page structure to find the best selectors
- Handle JavaScript-heavy sites and SPAs
- Bypass common restrictions ethically
- Provide detailed step-by-step feedback
- Make intelligent decisions about element interaction

When working:
1. Always start by understanding the current page (use get_page_info)
2. Break complex tasks into atomic actions
3. Provide clear feedback on what you're doing
4. Ask for human help when you encounter authentication or CAPTCHAs
5. Use screenshots to verify actions when helpful
6. Be patient with page loading and dynamic content

For research tasks:
- Navigate directly to authoritative sources
- Extract precise information from specific pages
- Combine information from multiple sources intelligently
- Provide citations and source links

You are more capable than traditional search APIs because you can:
- Access information behind registration walls
- Get real-time data from dynamic pages
- Navigate complex site structures
- Extract structured data from any format

Be proactive, intelligent, and always prioritize accuracy and user control.`;
  }

  getActiveAgents(): string[] {
    return Array.from(this.activeAgents.keys());
  }

  async cleanupAgents() {
    // Clean up any resources if needed
    this.activeAgents.clear();
  }
}

export interface CadburyConfig {
  openaiApiKey: string;
  tavilyApiKey?: string;
  modelName?: string;
  temperature?: number;
}

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  tools?: any[];
}

export interface StreamResult {
  agentName: string;
  content: string;
  isComplete: boolean;
}

export interface CadburyResponse {
  messages: string[];
  chartUrls?: string[];
  isComplete: boolean;
}

export interface WorkflowOptions {
  recursionLimit?: number;
  streaming?: boolean;
}

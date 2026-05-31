export interface ModelDefinition {
  id: string;
  name: string;
  provider: string;
  description: string;
  bestFor: string; // catalogue hint sent to the frontend
  costTier: 'low' | 'moderate' | 'high';
  pricing: {
    input: number;  // $ per 1M input tokens
    output: number; // $ per 1M output tokens
  };
}

/** Safe to send to clients — pricing stripped */
export type AgentModel = Omit<ModelDefinition, 'pricing'>;

export const MODEL_REGISTRY: ModelDefinition[] = [
  // ─── OpenAI ─────────────────────────────────────────────────────────────────

  // HIGH — orchestrators / deep reasoners
  {
    id: 'o3',
    name: 'OpenAI o3',
    provider: 'openai',
    description: 'Frontier reasoning model; best-in-class for math, science, and multi-step planning',
    bestFor: 'Top-level orchestrator agents, research synthesis, complex financial modelling, and any task where deep chain-of-thought reasoning is worth the cost.',
    costTier: 'high',
    pricing: { input: 10.0, output: 40.0 },
  },

  // MODERATE — capable workers
  {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    provider: 'openai',
    description: 'Flagship GPT with 1M-token context and superior instruction following',
    bestFor: 'Long-context analysis, codebase-wide reasoning, structured output generation, and production agents needing strong accuracy at moderate cost.',
    costTier: 'moderate',
    pricing: { input: 2.0, output: 8.0 },
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    description: 'Multi-modal GPT-4 class model with vision and strong tool use',
    bestFor: 'Agents that process images or mixed-media inputs, multi-step tool chains, and tasks where vision capability is required.',
    costTier: 'moderate',
    pricing: { input: 2.5, output: 10.0 },
  },
  {
    id: 'o4-mini',
    name: 'OpenAI o4-mini',
    provider: 'openai',
    description: 'Fast, cost-efficient reasoning model; excellent at coding and visual tasks',
    bestFor: 'Sub-agent reasoning steps, coding agents, and scenarios where you want o-series chain-of-thought without o3 price.',
    costTier: 'moderate',
    pricing: { input: 1.1, output: 4.4 },
  },

  // LOW — high-throughput / monitoring
  {
    id: 'gpt-4.1-mini',
    name: 'GPT-4.1 Mini',
    provider: 'openai',
    description: 'Efficient mid-tier GPT-4.1 variant balancing quality and cost',
    bestFor: 'High-volume classification, summarisation workers, and sub-agents that process large numbers of documents where full GPT-4.1 quality is not required.',
    costTier: 'low',
    pricing: { input: 0.40, output: 1.60 },
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    description: 'Lightweight GPT-4o variant optimised for speed and cost',
    bestFor: 'Monitoring agents, real-time signal checks, log parsing, and high-throughput tasks where sub-second latency and minimal cost are the priority.',
    costTier: 'low',
    pricing: { input: 0.15, output: 0.60 },
  },
  {
    id: 'gpt-4.1-nano',
    name: 'GPT-4.1 Nano',
    provider: 'openai',
    description: 'Ultra-lightweight GPT-4.1 variant; fastest and cheapest in the family',
    bestFor: 'Polling agents, heartbeat checks, simple entity extraction at massive scale, and any scenario where raw throughput matters more than reasoning depth.',
    costTier: 'low',
    pricing: { input: 0.10, output: 0.40 },
  },

  // ─── Anthropic ───────────────────────────────────────────────────────────────

  // HIGH — orchestrators / frontier reasoning
  {
    id: 'claude-opus-4-8',
    name: 'Claude Opus 4.8',
    provider: 'anthropic',
    description: "Anthropic's current frontier model — deepest reasoning and agentic planning (released May 2026)",
    bestFor: 'Top-level orchestrator agents, multi-step strategy planning, research synthesis, and tasks demanding the highest accuracy where cost is secondary.',
    costTier: 'high',
    pricing: { input: 5.0, output: 25.0 },
  },
  {
    id: 'claude-opus-4-7',
    name: 'Claude Opus 4.7',
    provider: 'anthropic',
    description: "Anthropic's previous flagship — same headline price as 4.8 with proven stability",
    bestFor: 'Stable production orchestrators already pinned to Opus 4.7, complex financial analysis, and workloads where a battle-tested model is preferred.',
    costTier: 'high',
    pricing: { input: 5.0, output: 25.0 },
  },

  // MODERATE — balanced production workloads
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    description: "Anthropic's best balance of intelligence and speed",
    bestFor: 'Trading signal agents, risk management, structured output generation, and production workloads that need strong reasoning without Opus pricing.',
    costTier: 'moderate',
    pricing: { input: 3.0, output: 15.0 },
  },

  // LOW — real-time / high-frequency
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    description: 'Fastest and most affordable Anthropic model',
    bestFor: 'Real-time monitoring agents, high-frequency polling, low-latency signal checks, and tasks where sub-second response is more important than reasoning depth.',
    costTier: 'low',
    pricing: { input: 1.0, output: 5.0 },
  },
];

/** Returns all models with pricing stripped — safe to expose to clients. */
export function getModels(): AgentModel[] {
  return MODEL_REGISTRY.map(({ pricing: _, ...rest }) => rest);
}

/** Returns models filtered by cost tier. */
export function getModelsByTier(tier: ModelDefinition['costTier']): AgentModel[] {
  return MODEL_REGISTRY.filter((m) => m.costTier === tier).map(({ pricing: _, ...rest }) => rest);
}

/** Lookup map used internally by cost-tracker — derived from the registry. */
export const MODEL_PRICING_MAP: Record<string, { input: number; output: number }> = Object.fromEntries(
  MODEL_REGISTRY.map((m) => [m.id, m.pricing]),
);

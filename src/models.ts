export interface ModelDefinition {
  id: string;
  name: string;
  provider: string;
  description: string;
  bestFor: string; // catalogue hint sent to the frontend
  pricing: {
    input: number;  // $ per 1M input tokens
    output: number; // $ per 1M output tokens
  };
}

/** Safe to send to clients — pricing stripped */
export type AgentModel = Omit<ModelDefinition, 'pricing'>;

export const MODEL_REGISTRY: ModelDefinition[] = [
  // --- OpenAI ---
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    description: 'Most capable GPT-4 model with vision and strong tool use',
    bestFor: 'Complex reasoning, image analysis, multi-step tool chains, and high-accuracy tasks where cost is secondary.',
    pricing: { input: 5.0, output: 15.0 },
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    description: 'Fast, affordable GPT-4 variant with solid tool use',
    bestFor: 'High-volume tasks, monitoring agents, simple classification, and log parsing where speed and cost matter.',
    pricing: { input: 0.15, output: 0.6 },
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    description: 'High-capability model with 128k context window',
    bestFor: 'Long document analysis, codebase-wide reasoning, and tasks requiring large context.',
    pricing: { input: 10.0, output: 30.0 },
  },
  {
    id: 'gpt-4',
    name: 'GPT-4',
    provider: 'openai',
    description: 'Original GPT-4 — reliable and well-tested',
    bestFor: 'General-purpose tasks where the standard GPT-4 quality is sufficient and the latest model is not required.',
    pricing: { input: 30.0, output: 60.0 },
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    description: 'Fast and cost-effective for simpler tasks',
    bestFor: 'Lightweight agents, quick summaries, and high-throughput operations where GPT-4 quality is not needed.',
    pricing: { input: 0.5, output: 1.5 },
  },
  // --- Anthropic ---
  {
    id: 'claude-opus-4-7',
    name: 'Claude Opus 4.7',
    provider: 'anthropic',
    description: "Anthropic's most powerful model — deep reasoning and agentic planning",
    bestFor: 'Complex strategy planning, multi-step financial analysis, research synthesis, and tasks that require nuanced judgement over many steps.',
    pricing: { input: 15.0, output: 75.0 },
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    description: "Anthropic's best balance of intelligence and speed",
    bestFor: 'Trading signal agents, risk management, structured output generation, and production workloads needing strong reasoning at lower cost than Opus.',
    pricing: { input: 3.0, output: 15.0 },
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    description: 'Fastest and most affordable Anthropic model',
    bestFor: 'Real-time monitoring agents, high-frequency polling, low-latency signal checks, and tasks where sub-second response matters.',
    pricing: { input: 0.8, output: 4.0 },
  },
];

/** Returns all models with pricing stripped — safe to expose to clients. */
export function getModels(): AgentModel[] {
  return MODEL_REGISTRY.map(({ pricing: _, ...rest }) => rest);
}

/** Lookup map used internally by cost-tracker — derived from the registry. */
export const MODEL_PRICING_MAP: Record<string, { input: number; output: number }> = Object.fromEntries(
  MODEL_REGISTRY.map((m) => [m.id, m.pricing]),
);

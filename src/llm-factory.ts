import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { CadburyConfig } from "./types";

/** Returns the appropriate LLM instance based on the model name in config. */
export function createLLM(config: CadburyConfig): BaseChatModel {
  const modelName = config.modelName || "gpt-3.5-turbo";
  const isAnthropic = modelName.startsWith("claude-");

  if (isAnthropic) {
    if (!config.anthropicApiKey) {
      throw new Error(
        `Model "${modelName}" requires anthropicApiKey in CadburyConfig`
      );
    }
    return new ChatAnthropic({
      apiKey: config.anthropicApiKey,
      model: modelName,
      temperature: config.temperature ?? 0,
    });
  }

  if (!config.openaiApiKey) {
    throw new Error(
      `Model "${modelName}" requires openaiApiKey in CadburyConfig`
    );
  }
  return new ChatOpenAI({
    apiKey: config.openaiApiKey,
    modelName,
    temperature: config.temperature ?? 0,
  });
}

import { END } from "@langchain/langgraph";
import { JsonOutputToolsParser } from "langchain/output_parsers";
import { ChatOpenAI } from "@langchain/openai";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { CadburyConfig } from "./types";

export class CadburyChain {
  public static members = ["researcher", "chart_generator"];
  private static systemPrompt =
    "You are cadbury as supervisor tasked with managing a conversation between the" +
    " following workers: {members}. Given the following user request," +
    " respond with the worker to act next. Each worker will perform a" +
    " task and respond with their results and status. When finished," +
    " respond with FINISH.";
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
      "Given the conversation above, who should act next?" +
        " Or should we FINISH? Select one of: {options}",
    ],
  ]);

  public llm: ChatOpenAI;

  constructor(config: CadburyConfig) {
    this.llm = new ChatOpenAI({
      apiKey: config.openaiApiKey,
      modelName: config.modelName || "gpt-3.5-turbo",
      temperature: config.temperature || 0,
    });
  }

  public async getCadburyChain() {
    const formattedPrompt = await CadburyChain.prompt.partial({
      options: CadburyChain.options.join(", "),
      members: CadburyChain.members.join(", "),
    });

    const cadburyChain = formattedPrompt
      .pipe(
        this.llm.bindTools([CadburyChain.toolDef], {
          tool_choice: { type: "function", function: { name: "route" } },
        })
      )
      .pipe(new JsonOutputToolsParser())
      // select the first one
      .pipe((x) => x[0].args);

    return cadburyChain;
  }
}

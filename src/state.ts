import { BaseMessage } from "@langchain/core/messages";
import { END, StateGraphArgs } from "@langchain/langgraph";
import { Channel } from "@langchain/langgraph/dist/pregel";

export interface AgentStateChannels {
  messages: BaseMessage[];
  // The agent node that last performed work
  next: string;
}

// This defines the object that is passed between each node
// in the graph. We will create different nodes for each agent and tool
export const agentStateChannels: StateGraphArgs<Channel>["channels"] = {
  messages: {
    value: (x?: BaseMessage[], y?: BaseMessage[]) => (x ?? []).concat(y ?? []),
    default: () => [],
  },
  next: {
    value: (x?: string, y?: string) => y ?? x ?? END,
    default: () => END,
  },
};

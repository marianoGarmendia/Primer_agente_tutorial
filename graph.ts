import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import {
  START,
  StateGraph,
  MessagesAnnotation,
  MemorySaver,
  Annotation,
} from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { z } from "zod";
import { argv } from "bun";

const model = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-3.5-turbo",
});

// instancio una herramienta
const tavilyTool = new TavilySearchResults({
  apiKey: process.env.TAVILY_API_KEY,
  maxResults: 3,
});

const tools = [tavilyTool];

//Le doy la herramienta al modelo8
const modelWithTools = model.bindTools(tools);

async function main() {
  const response = await modelWithTools.invoke(
    "Hola! quien gano las elecciones hoy 6-11-2024 en estados unidos"
  );

  if (response.tool_calls && response.tool_calls?.length > 0) {
    const query = response.tool_calls[0].args.input;
    const res = await tavilyTool.invoke(query);
    console.log(res);
  }
}

// main();

// ************ CONSTRUIMOS UN GRAPHO DE LANGGRAPH ************

const stateAnnotation = MessagesAnnotation;

const stateGraph = new StateGraph(MessagesAnnotation);

const toolNode = new ToolNode(tools);

const assistant = async (state: typeof stateAnnotation.State) => {
  const { messages } = state;
  const response = await modelWithTools.invoke(messages);
  return { messages: [...messages, response] };
};

const shouldContinue = (state: typeof stateAnnotation.State) => {
  const { messages } = state;
  const lastMessage = messages[messages.length - 1] as AIMessage;
  if (lastMessage.tool_calls && lastMessage.tool_calls?.length > 0) {
    return "tool";
  }
  return "__end__";
};

stateGraph
  .addNode("agent", assistant)
  .addNode("tool", toolNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", shouldContinue)
  .addEdge("tool", "agent");

const workflow = stateGraph.compile();

const response = await workflow.invoke({
  messages:
    "Hola! quien gano las ultimas elecciones del 2024 en estados unidos",
});

console.log(response);

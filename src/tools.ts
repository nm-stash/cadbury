import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { DynamicStructuredTool } from "langchain/tools";
import QuickChart from "quickchart-js";
import { z } from "zod";

export const createChartTool = () =>
  new DynamicStructuredTool({
    name: "generate_bar_chart",
    description:
      "Generates a bar chart from an array of data points and displays it for the user.",
    schema: z.object({
      data: z
        .object({
          label: z.string(),
          value: z.number(),
        })
        .array(),
    }),
    func: async ({ data }) => {
      const labels = data.map((d) => d.label);
      const values = data.map((d) => d.value);
      const backgroundColors = [
        "#e6194B",
        "#3cb44b",
        "#ffe119",
        "#4363d8",
        "#f58231",
        "#911eb4",
        "#42d4f4",
        "#f032e6",
        "#bfef45",
        "#fabebe",
      ];

      const chart = new QuickChart();
      chart
        .setConfig({
          type: "bar",
          data: {
            labels: labels,
            datasets: [
              {
                label: "Values",
                data: values,
                backgroundColor: backgroundColors.slice(0, data.length),
              },
            ],
          },
          options: {
            scales: {
              x: {
                beginAtZero: true,
              },
              y: {
                beginAtZero: true,
              },
            },
          },
        })
        .setWidth(500)
        .setHeight(500);

      const chartUrl = chart.getUrl();

      return `Chart has been generated and can be viewed at: ${chartUrl}`;
    },
  });

export const createTavilyTool = (apiKey?: string) => {
  if (!apiKey) {
    throw new Error("Tavily API key is required for search functionality");
  }
  return new TavilySearchResults({
    apiKey: apiKey,
  });
};

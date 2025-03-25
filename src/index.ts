import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { z } from "zod";
import yahooFinance from "yahoo-finance2";
import NewsAPI from "newsapi";

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";
const NEWS_API_KEY = "c8e954044ee64a53a074a37e55efc2f7";
const newsapi = new NewsAPI(NEWS_API_KEY);

// Initialize MCP Server
const server = new McpServer({ name: "weather-stock", version: "1.0.0" });

/**
 * Helper function for API requests
 */
async function fetchData(url: string, headers = {}) {
  try {
    const response = await axios.get(url, { headers });
    return response.data;
  } catch (error: any) {
    console.error(`Error fetching data from ${url}:`, error.message);
    return null;
  }
}

/**
 * Format weather alerts
 */
function formatAlert({ properties }: any) {
  return `🚨 ${properties.event || "Unknown"}\n📍 ${properties.areaDesc || "Unknown"}\n⚠️ Severity: ${properties.severity || "Unknown"}\n📰 ${properties.headline || "No headline"}\n---`;
}

/**
 * Fetch weather alerts by state
 */
server.tool(
  "get-alerts",
  "Get weather alerts for a state",
  {
    state: z.string().length(2).describe("Two-letter state code (e.g., CA, NY)"),
  },
  async ({ state }) => {
    const alertsUrl = `${NWS_API_BASE}/alerts?area=${state.toUpperCase()}`;
    const data = await fetchData(alertsUrl, { "User-Agent": USER_AGENT });

    if (!data || !data.features?.length) {
      return { content: [{ type: "text", text: `✅ No active alerts for ${state.toUpperCase()}` }] };
    }

    return { content: [{ type: "text", text: `Active Alerts for ${state.toUpperCase()}:\n\n${data.features.map(formatAlert).join("\n")}` }] };
  }
);

/**
 * Fetch weather forecast
 */
server.tool(
  "get-forecast",
  "Get weather forecast for a location",
  {
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  },
  async ({ latitude, longitude }) => {
    const pointsData = await fetchData(`${NWS_API_BASE}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`, { "User-Agent": USER_AGENT });

    if (!pointsData?.properties?.forecast) {
      return { content: [{ type: "text", text: `🚫 No forecast data available for ${latitude}, ${longitude}.` }] };
    }

    const forecastData = await fetchData(pointsData.properties.forecast, { "User-Agent": USER_AGENT });
    if (!forecastData?.properties?.periods?.length) {
      return { content: [{ type: "text", text: "🚫 No forecast periods available." }] };
    }

    return {
      content: [{
        type: "text",
        text: `🌤 Forecast for (${latitude}, ${longitude}):\n\n${forecastData.properties.periods.map((p: any)=> `📅 ${p.name}: ${p.temperature}°${p.temperatureUnit}, ${p.shortForecast}, 🌬️ ${p.windSpeed} ${p.windDirection}`).join("\n")}`,
      }],
    };
  }
);

/**
 * Fetch current stock price
 */
server.tool(
  "get-stock-price",
  "Fetch the current price of a stock",
  {
    symbol: z.string().describe("Stock ticker symbol (e.g., AAPL, TSLA)"),
  },
  async ({ symbol }) => {
    try {
      const quote = await yahooFinance.quote(symbol);
      return { content: [{ type: "text", text: `💹 ${symbol} is currently at $${quote?.regularMarketPrice}.` }] };
    } catch (error) {
      console.error(`Error fetching stock price for ${symbol}:`, error);
      return { content: [{ type: "text", text: `🚫 Failed to fetch stock price for ${symbol}.` }] };
    }
  }
);

/**
 * Fetch historical stock data
 */
server.tool(
  "get-historical-data",
  "Fetch historical stock data",
  {
    symbol: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    interval: z.enum(["1d", "1wk", "1mo"]),
  },
  async ({ symbol, startDate, endDate, interval }) => {
    try {
      const result = await yahooFinance.historical(symbol, { period1: startDate, period2: endDate, interval });
      if (!result.length) return { content: [{ type: "text", text: `🚫 No historical data for ${symbol} in this range.` }] };

      return { content: [{ type: "text", text: `📊 Historical Data for ${symbol}:\n\n${result.map(e => `📅 ${e.date}: Close at $${e.close}`).join("\n")}` }] };
    } catch (error) {
      console.error(`Error fetching historical data for ${symbol}:`, error);
      return { content: [{ type: "text", text: `🚫 Failed to fetch historical data.` }] };
    }
  }
);

/**
 * Fetch stock news
 */
server.tool(
  "get-news",
  "Fetch stock-related news",
  {
    stockName: z.string(),
    startDate: z.string(),
    endDate: z.string(),
  },
  async ({ stockName, startDate, endDate }) => {
    try {
      const response = await newsapi.v2.everything({
        q: stockName,
        from: startDate,
        to: endDate,
        language: "en",
        sortBy: "relevancy",
      });

      if (!response.articles?.length) {
        return { content: [{ type: "text", text: `📰 No news found for ${stockName} between ${startDate} and ${endDate}.` }] };
      }

      return {
        content: [{
          type: "text",
          text: `📰 Top News for ${stockName}:\n\n${response.articles.slice(0, 5).map((a: any) => `📌 ${a.title}\n🔗 ${a.url}`).join("\n\n")}`,
        }],
      };
    } catch (error) {
      console.error(`Error fetching news for ${stockName}:`, error);
      return { content: [{ type: "text", text: `🚫 Failed to fetch news.` }] };
    }
  }
);

/**
 * Initialize the MCP server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🚀 Weather & Stock MCP Server Running...");
}

main().catch(error => {
  console.error("🔥 Fatal error in main():", error);
  process.exit(1);
});

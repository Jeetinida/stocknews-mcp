import 'dotenv/config';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { z } from "zod";
import yahooFinance from "yahoo-finance2";
import NewsAPI from "newsapi";
import { SMA, EMA, RSI, MACD, BollingerBands } from "./functions/technicalIndicator.js";

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";
const NEWS_API_KEY =  process.env.NEWS_API_KEY;
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
 * Technical Indicators Tool
 */
server.tool(
  "get-technical-indicators",
  "Calculate technical indicators for a stock",
  {
    symbol: z.string().describe("Stock ticker symbol (e.g., AAPL, TSLA)"),
    indicator: z.enum([
      "sma", 
      "ema", 
      "rsi", 
      "macd", 
      "bollinger"
    ]).describe("Technical indicator to calculate"),
    period: z.number().min(1).max(200).default(14).describe("Period for the indicator calculation"),
    startDate: z.string().describe("Start date in YYYY-MM-DD format"),
    endDate: z.string().describe("End date in YYYY-MM-DD format"),
  },
  async ({ symbol, indicator, period, startDate, endDate }) => {
    try {
      // Fetch historical data
      const historicalData = await yahooFinance.historical(symbol, { 
        period1: startDate, 
        period2: endDate, 
        interval: "1d" 
      });
      
      if (!historicalData.length) {
        return { content: [{ type: "text", text: `🚫 No historical data available for ${symbol} in the specified range.` }] };
      }

      // Extract closing prices
      const closingPrices = historicalData.map(day => day.close);
      const dates = historicalData.map(day => typeof day.date === 'object' ? day.date.toISOString().split('T')[0] : day.date);
      
      // OHLC data for indicators that need it
      const ohlcData = historicalData.map(day => ({
        open: day.open,
        high: day.high,
        low: day.low,
        close: day.close,
      }));

      let result = "";
      let indicatorValues = [];

      // Calculate the requested indicator
      switch (indicator) {
        case "sma": {
          const smaValues = SMA(closingPrices, period);
          
          // Align dates with SMA values (SMA values start after period-1 days)
          const smaResults = dates.slice(period - 1).map((date, i) => ({
            date,
            sma: smaValues[i]
          }));
          
          indicatorValues = smaResults;
          result = `📈 SMA(${period}) for ${symbol}:\n\n${smaResults.slice(-10).map(day => 
            `📅 ${day.date}: SMA = $${day.sma.toFixed(2)}`).join('\n')}`;
          break;
        }
        
        case "ema": {
          const emaValues = EMA(closingPrices, period);
          
          // Align dates with EMA values
          const emaResults = dates.slice(period - 1).map((date, i) => ({
            date,
            ema: emaValues[i]
          }));
          
          indicatorValues = emaResults;
          result = `📉 EMA(${period}) for ${symbol}:\n\n${emaResults.slice(-10).map(day => 
            `📅 ${day.date}: EMA = $${day.ema.toFixed(2)}`).join('\n')}`;
          break;
        }
        
        case "rsi": {
          const rsiValues = RSI(closingPrices, period);
          
          // Align dates with RSI values
          const rsiResults = dates.slice(period).map((date, i) => ({
            date,
            rsi: rsiValues[i]
          }));
          
          indicatorValues = rsiResults;
          result = `🔍 RSI(${period}) for ${symbol}:\n\n${rsiResults.slice(-10).map(day => {
            let rsiLevel = "";
            if (day.rsi > 70) rsiLevel = "⚠️ Potentially Overbought";
            else if (day.rsi < 30) rsiLevel = "⚠️ Potentially Oversold";
            
            return `📅 ${day.date}: RSI = ${day.rsi.toFixed(2)} ${rsiLevel}`;
          }).join('\n')}`;
          break;
        }
        
        case "macd": {
          // Standard MACD parameters
          const fastPeriod = 12;
          const slowPeriod = 26;
          const signalPeriod = 9;
          
          const macdValues = MACD(closingPrices, fastPeriod, slowPeriod, signalPeriod);
          
          // Align dates with MACD values
          const macdResults = dates.slice(slowPeriod + signalPeriod - 2).map((date, i) => ({
            date,
            macd: macdValues.macd[i],
            signal: macdValues.signal[i],
            histogram: macdValues.histogram[i]
          }));
          
          indicatorValues = macdResults;
          result = `📊 MACD(${fastPeriod},${slowPeriod},${signalPeriod}) for ${symbol}:\n\n${macdResults.slice(-10).map(day => {
            let signal = "";
            if (day.histogram! > 0 && day.histogram! > macdResults[macdResults.indexOf(day) - 1]?.histogram!) 
              signal = "📈 Bullish";
            else if (day.histogram! < 0 && day.histogram! < macdResults[macdResults.indexOf(day) - 1]?.histogram!) 
              signal = "📉 Bearish";
            
            return `📅 ${day.date}: MACD = ${day.macd!.toFixed(2)}, Signal = ${day.signal!.toFixed(2)}, Histogram = ${day.histogram!.toFixed(2)} ${signal}`;
          }).join('\n')}`;
          break;
        }
        
        case "bollinger": {
          const standardDeviation = 2;
          
          const bbandsValues = BollingerBands(closingPrices, period, standardDeviation);
          
          // Align dates with Bollinger Bands values
          const bbandsResults = dates.slice(period - 1).map((date, i) => ({
            date,
            upper: bbandsValues.upper[i],
            middle: bbandsValues.middle[i],
            lower: bbandsValues.lower[i],
            price: closingPrices[period - 1 + i]
          }));
          
          indicatorValues = bbandsResults;
          result = `🎯 Bollinger Bands(${period}, ${standardDeviation}σ) for ${symbol}:\n\n${bbandsResults.slice(-10).map(day => {
            let position = "";
            if (day.price > day.upper) position = "⚠️ Above Upper Band";
            else if (day.price < day.lower) position = "⚠️ Below Lower Band";
            
            return `📅 ${day.date}: Upper = $${day.upper.toFixed(2)}, Middle = $${day.middle.toFixed(2)}, Lower = $${day.lower.toFixed(2)}, Price = $${day.price.toFixed(2)} ${position}`;
          }).join('\n')}`;
          break;
        }
      }

      return { 
        content: [{ 
          type: "text", 
          text: `${result}\n\n(Showing the last 10 data points. Request covered ${dates.length} trading days.)` 
        }]
      };
    } catch (error) {
      console.error(`Error calculating technical indicators for ${symbol}:`, error);
      return { content: [{ type: "text", text: `🚫 Failed to calculate ${indicator} for ${symbol}.` }] };
    }
  }
);

/**
 * Comprehensive Technical Analysis Tool
 */
server.tool(
  "get-technical-analysis",
  "Get comprehensive technical analysis for a stock",
  {
    symbol: z.string().describe("Stock ticker symbol (e.g., AAPL, TSLA)"),
    startDate: z.string().describe("Start date in YYYY-MM-DD format"),
    endDate: z.string().describe("End date in YYYY-MM-DD format"),
  },
  async ({ symbol, startDate, endDate }) => {
    try {
      // Fetch historical data
      const historicalData = await yahooFinance.historical(symbol, { 
        period1: startDate, 
        period2: endDate, 
        interval: "1d" 
      });
      
      if (!historicalData.length) {
        return { content: [{ type: "text", text: `🚫 No historical data available for ${symbol} in the specified range.` }] };
      }

      // Extract price data
      const closingPrices = historicalData.map(day => day.close);
      const latestPrice = closingPrices[closingPrices.length - 1];
      const previousPrice = closingPrices[closingPrices.length - 2];
      
      // Calculate various indicators
      const sma20 = SMA(closingPrices, 20).pop();
      const sma50 = SMA(closingPrices, 50).pop();
      const sma200 = SMA(closingPrices, 200).pop();
      
      const ema12 = EMA(closingPrices, 12).pop();
      const ema26 = EMA(closingPrices, 26).pop();
      
      const rsi14 = RSI(closingPrices, 14).pop();
      
      const macdResult = MACD(closingPrices, 12, 26, 9);
      const macd = macdResult.macd.pop();
      const macdSignal = macdResult.signal?.pop();
      const macdHistogram = macdResult.histogram?.pop();
      
      const bbands = BollingerBands(closingPrices, 20, 2);
      const bbandsUpper = bbands.upper.pop();
      const bbandsMiddle = bbands.middle.pop();
      const bbandsLower = bbands.lower.pop();

      // Analyze the trends
      let trendAnalysis = [];
      
      // Moving Average Analysis
      if (sma20 !== undefined && sma50 !== undefined && latestPrice > sma20 && sma20 > sma50) {
        trendAnalysis.push("📈 Price is above SMA(20) and SMA(50), suggesting a positive trend.");
      } else if (sma20 !== undefined && sma50 !== undefined && latestPrice < sma20 && sma20 < sma50) {
        trendAnalysis.push("📉 Price is below SMA(20) and SMA(50), suggesting a negative trend.");
      }
      
      if ((sma50 ?? 0) > (sma200 ?? 0)) {
        trendAnalysis.push("📈 SMA(50) is above SMA(200), indicating a long-term uptrend (Golden Cross pattern).");
      } else if ((sma50 ?? 0) < (sma200 ?? 0)) {
        trendAnalysis.push("📉 SMA(50) is below SMA(200), indicating a long-term downtrend (Death Cross pattern).");
      }
      
      // RSI Analysis
      if ((rsi14 ?? 0) > 70) {
        trendAnalysis.push("⚠️ RSI(14) is above 70, suggesting the stock may be overbought.");
      } else if ((rsi14 ?? 0) < 30) {
        trendAnalysis.push("⚠️ RSI(14) is below 30, suggesting the stock may be oversold.");
      } else {
        trendAnalysis.push(`✅ RSI(14) is at ${(rsi14 ?? 0).toFixed(2)}, indicating neutral momentum.`);
      }
      
      // MACD Analysis
      if (macdResult && macdResult.macd! > (macdResult.signal ?? 0)) {
        trendAnalysis.push("📈 MACD is above signal line, suggesting bullish momentum.");
      } else {
        trendAnalysis.push("📉 MACD is below signal line, suggesting bearish momentum.");
      }
      
      // Bollinger Bands Analysis
      if (latestPrice > bbandsUpper!) {
        trendAnalysis.push("⚠️ Price is above the upper Bollinger Band, potentially indicating overbought conditions.");
      } else if (latestPrice <  bbandsLower!) {
        trendAnalysis.push("⚠️ Price is below the lower Bollinger Band, potentially indicating oversold conditions.");
      } else {
        const bandWidth = bbandsUpper! - bbandsLower!;
        if (bandWidth < 10) {
          trendAnalysis.push("📊 Bollinger Bands are contracting, suggesting a potential upcoming volatility increase.");
        }
      }
      
      // Support/Resistance Analysis
      const recentPrices = closingPrices.slice(-30);
      const max = Math.max(...recentPrices);
      const min = Math.min(...recentPrices);
      
      const resistanceLevels: number[] = [];
      const supportLevels: number[] = [];
      
      // Simple algorithm to identify potential support/resistance levels
      // This is a simplified approach - in a real application you'd want a more sophisticated algorithm
      for (let i = 10; i < recentPrices.length - 1; i++) {
        if (recentPrices[i] > recentPrices[i-1] && recentPrices[i] > recentPrices[i+1]) {
          const potentialResistance = recentPrices[i];
          // Check if we already have a similar level
          if (!resistanceLevels.some(level => Math.abs(level - potentialResistance) / potentialResistance < 0.01)) {
            resistanceLevels.push(potentialResistance);
          }
        }
        
        if (recentPrices[i] < recentPrices[i-1] && recentPrices[i] < recentPrices[i+1]) {
          const potentialSupport = recentPrices[i];
          // Check if we already have a similar level
          if (!supportLevels.some(level => Math.abs(level - potentialSupport) / potentialSupport < 0.01)) {
            supportLevels.push(potentialSupport);
          }
        }
      }
      
      // Sort and take the most significant levels
      resistanceLevels.sort((a, b) => b - a);
      supportLevels.sort((a, b) => b - a);
      
      const significantResistance = resistanceLevels.length > 0 ? 
        resistanceLevels.slice(0, Math.min(2, resistanceLevels.length)) : [];
      const significantSupport = supportLevels.length > 0 ? 
        supportLevels.slice(-Math.min(2, supportLevels.length)) : [];
      
      // Volume Analysis
      const volumes = historicalData.map(day => day.volume);
      const avgVolume = volumes.slice(-10).reduce((sum, vol) => sum + vol, 0) / 10;
      const latestVolume = volumes[volumes.length - 1];
      
      if (latestVolume > avgVolume * 1.5) {
        trendAnalysis.push("📊 Trading volume is significantly higher than average, suggesting strong market interest.");
      } else if (latestVolume < avgVolume * 0.5) {
        trendAnalysis.push("📊 Trading volume is significantly lower than average, suggesting weak market interest.");
      }
      
      // Generate the analysis text
      let analysisText = `🔍 Technical Analysis for ${symbol}\n\n`;
      
      // Price information
      analysisText += `Current Price: $${latestPrice.toFixed(2)}\n`;
      analysisText += `Daily Change: ${((latestPrice - previousPrice) / previousPrice * 100).toFixed(2)}%\n\n`;
      
      // Key Indicators
      analysisText += `Key Indicators:\n`;
      analysisText += `• SMA(20): $${(sma20 ?? 0).toFixed(2)}\n`;
      analysisText += `• SMA(50): $${(sma50 ?? 0).toFixed(2)}\n`;
      analysisText += `• SMA(200): $${(sma200 ?? 0).toFixed(2)}\n`;
      analysisText += `• RSI(14): ${(rsi14 ?? 0).toFixed(2)}\n`;
      analysisText += `• MACD: ${(macd ?? 0).toFixed(2)}\n`;
      analysisText += `• MACD Signal: ${macdSignal ?.toFixed(2) ?? "N/A"}\n`;
      analysisText += `• MACD Histogram: ${(macdHistogram ?? 0).toFixed(2)}\n`;
      if (bbands) {
        analysisText += `• Bollinger Upper: $${(bbandsUpper ?? 0).toFixed(2)}\n`;
        analysisText += `• Bollinger Middle: $${(bbandsMiddle ?? 0).toFixed(2)}\n`;
        analysisText += `• Bollinger Lower: $${(bbandsLower ?? 0).toFixed(2)}\n\n`;
      } else {
        analysisText += `• Bollinger Bands: Data unavailable\n\n`;
      }
      
      // Support & Resistance
      if (significantResistance.length > 0 || significantSupport.length > 0) {
        analysisText += `Support & Resistance:\n`;
        
        if (significantResistance.length > 0) {
          analysisText += `• Resistance: ${significantResistance.map(level => `$${level.toFixed(2)}`).join(', ')}\n`;
        }
        
        if (significantSupport.length > 0) {
          analysisText += `• Support: ${significantSupport.map(level => `$${level.toFixed(2)}`).join(', ')}\n`;
        }
        
        analysisText += `\n`;
      }
      
      // Analysis summary
      analysisText += `Analysis Summary:\n`;
      trendAnalysis.forEach(trend => {
        analysisText += `• ${trend}\n`;
      });
      
      return { content: [{ type: "text", text: analysisText }] };
    } catch (error) {
      console.error(`Error generating technical analysis for ${symbol}:`, error);
      return { content: [{ type: "text", text: `🚫 Failed to generate technical analysis for ${symbol}.` }] };
    }
  }
);

/**
 * Initialize the MCP server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🚀 Weather & Stock MCP Server Running with Technical Analysis...");
}

main().catch(error => {
  console.error("🔥 Fatal error in main():", error);
  process.exit(1);
});
// ───────────────────────────────────────────────────────────────────────────────
// src/tools.ts
// Centralised registration of all MCP tools for the Weather + Stock server
// ───────────────────────────────────────────────────────────────────────────────

import axios from "axios";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import yahooFinance from "yahoo-finance2";
import NewsAPI from "newsapi";
import { z } from "zod";

import { SMA, EMA, RSI, MACD, BollingerBands } from "../functions/technicalIndicator.js";

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT   = "weather-app/1.0";
const NEWS_API_KEY = process.env.NEWS_API_KEY ?? "";
const newsapi      = new NewsAPI(NEWS_API_KEY);

/* -------------------------------------------------------------------------- */
/* Helper utilities                                                           */
/* -------------------------------------------------------------------------- */

async function fetchData<T = any>(url: string, headers: Record<string,string> = {}): Promise<T | null> {
  try {
    const { data } = await axios.get<T>(url, { headers });
    return data;
  } catch (err: any) {
    console.error(`Error fetching ${url}:`, err.message);
    return null;
  }
}

function formatAlert({ properties }: any): string {
  return [
    `🚨 ${properties.event       ?? "Unknown"}`,
    `📍 ${properties.areaDesc    ?? "Unknown"}`,
    `⚠️  Severity: ${properties.severity ?? "Unknown"}`,
    `📰 ${properties.headline    ?? "No headline"}`,
    "---"
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* Main export: registerTools                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Attaches every MCP tool to the provided server instance.
 * Keep all your tool definitions in this file so the entry‑point stays tiny.
 */
export function registerTools(server: McpServer) {

  /* ───── Stock: current price ─────────────────────────────────────────── */
  server.tool(
    "get-stock-price",
    "Fetch the current price for a ticker",
    { symbol: z.string().describe("Ticker, e.g. AAPL") },
    async ({ symbol }) => {
      try {
        const quote = await yahooFinance.quote(symbol);
        return { content: [{ type: "text", text: `💹 ${symbol}: $${quote?.regularMarketPrice}` }] };
      } catch (err) {
        console.error(err);
        return { content: [{ type: "text", text: `🚫 Could not fetch price for ${symbol}.` }] };
      }
    },
  );

  /* ───── Stock: historical data ───────────────────────────────────────── */
  server.tool(
    "get-historical-data",
    "Fetch historical OHLC data",
    {
      symbol:    z.string(),
      startDate: z.string(),
      endDate:   z.string(),
      interval:  z.enum(["1d", "1wk", "1mo"]),
    },
    async ({ symbol, startDate, endDate, interval }) => {
      try {
        const rows = await yahooFinance.historical(symbol, { period1: startDate, period2: endDate, interval });
        if (!rows.length)
          return { content: [{ type: "text", text: `🚫 No data for ${symbol} in that range.` }] };

        const txt = rows.map(r => `📅 ${r.date}: close $${r.close}`).join("\n");
        return { content: [{ type: "text", text: `📊 Historical for ${symbol}:\n\n${txt}` }] };
      } catch {
        return { content: [{ type: "text", text: "🚫 Failed to fetch historical data." }] };
      }
    },
  );

  /* ───── Stock: news ──────────────────────────────────────────────────── */
  server.tool(
    "get-news",
    "Get news articles for a company/stock",
    {
      stockName: z.string(),
      startDate: z.string(),
      endDate:   z.string(),
    },
    async ({ stockName, startDate, endDate }) => {
      try {
        const news = await newsapi.v2.everything({
          q: stockName,
          from: startDate,
          to: endDate,
          language: "en",
          sortBy: "relevancy",
        });

        if (!news.articles?.length)
          return { content: [{ type: "text", text: `📰 No news for ${stockName}.` }] };

        const text = news.articles.slice(0, 5)
          .map((a: { title: any; url: any; }) => `📌 ${a.title}\n🔗 ${a.url}`)
          .join("\n\n");

        return { content: [{ type: "text", text: `📰 Top news for ${stockName}:\n\n${text}` }] };
      } catch {
        return { content: [{ type: "text", text: "🚫 Failed to fetch news." }] };
      }
    },
  );

  /* ───── Stock: single technical indicator ────────────────────────────── */
  server.tool(
    "get-technical-indicators",
    "Calculate a single technical indicator",
    {
      symbol:    z.string(),
      indicator: z.enum(["sma", "ema", "rsi", "macd", "bollinger"]),
      period:    z.number().min(1).max(200).default(14),
      startDate: z.string(),
      endDate:   z.string(),
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
    },
  );

  /* ───── Stock: comprehensive analysis ───────────────────────────────── */
  server.tool(
    "get-technical-analysis",
    "Full multi‑indicator technical analysis",
    {
      symbol:    z.string(),
      startDate: z.string(),
      endDate:   z.string(),
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
    },
  );
}

function indicatorSwitch(
  indicator: string,
  closes: number[],
  dates: string[],
  period: number,
  symbol: string,
): string {
  // Insert your long switch/case from earlier (SMA, EMA, RSI, MACD, Bollinger)
  // and return the final formatted string.
  return `🚧 ${indicator} not yet implemented for ${symbol}`;
}

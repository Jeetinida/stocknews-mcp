# Weather & Stock MCP Server 🌦️📉

This project is an **MCP (Model Context Protocol) server** that provides **weather alerts, forecasts, stock prices, historical data, and news** using various APIs.

## Features 🚀
- 🐼 Fetch **real-time stock prices** using Yahoo Finance
- 📊 Retrieve **historical stock data** (daily, weekly, monthly)
- 📰 Get **stock-related news** from NewsAPI
- 🌦️ Fetch **weather alerts and forecasts** using the National Weather Service API

## Installation & Setup ⚙️

### Prerequisites
- **Node.js** (v18 or higher)
- **Git**
- An API key for [NewsAPI](https://newsapi.org/)

### Steps
1. Clone the repository:
   ```sh
   git clone https://github.com/<your-username>/<repo-name>.git
   cd <repo-name>
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Set up environment variables:  
   Create a `.env` file and add:
   ```
   NEWS_API_KEY=your_newsapi_key
   ```
4. Start the server:
   ```sh
   npm start
   ```

## Usage 🛠️
The MCP server provides the following tools:

### Get Stock Price
```json
{
  "tool": "get-stock-price",
  "params": {
    "symbol": "AAPL"
  }
}
```
### Get Historical Stock Data
```json
{
  "tool": "get-historical-data",
  "params": {
    "symbol": "AAPL",
    "startDate": "2024-01-01",
    "endDate": "2024-03-01",
    "interval": "1d"
  }
}
```
### Get News
```json
{
  "tool": "get-news",
  "params": {
    "stockName": "Tesla",
    "startDate": "2024-03-01",
    "endDate": "2024-03-10"
  }
}
```

## Contributing 🤝
Feel free to fork this repo, make changes, and submit a pull request! 🚀

## License 🐟
This project is licensed under the MIT License.
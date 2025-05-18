/*
    File to define the technical indicator functions
    This file contains the implementation of various technical indicators
    such as SMA, EMA, RSI, MACD, and Bollinger Bands.


*/
import * as technicalindicators from 'technicalindicators';
/// function to calculate the Simple Moving Average (SMA)
export function SMA(data, period) {
    const sma = technicalindicators.SMA.calculate({
        period: period,
        values: data
    });
    return sma;
}
/// function to calculate the Exponential Moving Average (EMA)
export function EMA(data, period) {
    const ema = technicalindicators.EMA.calculate({
        period: period,
        values: data
    });
    return ema;
}
/// function to calculate the Relative Strength Index (RSI)
export function RSI(data, period) {
    const rsi = technicalindicators.RSI.calculate({
        period: period,
        values: data
    });
    return rsi;
}
/// function to calculate the Moving Average Convergence Divergence (MACD)
export function MACD(data, shortPeriod, longPeriod, signalPeriod) {
    const macd = technicalindicators.MACD.calculate({
        values: data,
        fastPeriod: shortPeriod,
        slowPeriod: longPeriod,
        signalPeriod: signalPeriod,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    });
    return {
        macd: macd.map(output => output.MACD).filter((value) => value !== undefined),
        signal: macd.map(output => output.signal).filter((value) => value !== undefined),
        histogram: macd.map(output => output.histogram).filter((value) => value !== undefined)
    };
}
/// function to calculate the Bollinger Bands
export function BollingerBands(data, period, stdDev) {
    const bb = technicalindicators.BollingerBands.calculate({
        period: period,
        values: data,
        stdDev: stdDev
    });
    return {
        upper: bb.map(output => output.upper).filter((value) => value !== undefined),
        middle: bb.map(output => output.middle).filter((value) => value !== undefined),
        lower: bb.map(output => output.lower).filter((value) => value !== undefined)
    };
}

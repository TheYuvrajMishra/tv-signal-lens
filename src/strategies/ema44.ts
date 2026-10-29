import { emaSeries } from "../core/ema";
import type { Candle } from "../core/parser";
import type { Signal, Strategy } from "./types";
export function createEma44(period = 44): Strategy {
  return {
    id: "ema44", name: "EMA Cross (44)",
    params: { period },
    evaluate(candles: Candle[]): Signal[] {
      const closes = candles.map((c) => c.c);
      const emas = emaSeries(closes, period);
      const out: Signal[] = [];
      for (let i = 1; i < candles.length; i++) {
        const prevEma = emas[i - 1], ema = emas[i]; if (prevEma === null || ema === null) continue;
        const prev = candles[i - 1], cur = candles[i];
        const bullish = cur.c > cur.o, bearish = cur.c < cur.o;
        if (prev.c <= prevEma && cur.c > ema && bullish)
          out.push({ t: cur.t, type: "BUY", price: cur.c, reason: `Close crossed above EMA${period}, bullish close` });
        else if (prev.c >= prevEma && cur.c < ema && bearish)
          out.push({ t: cur.t, type: "SELL", price: cur.c, reason: `Close crossed below EMA${period}, bearish close` });
      }
      return out;
    },
  };
}

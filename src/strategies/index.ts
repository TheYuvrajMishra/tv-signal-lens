import type { Strategy } from "./types";
import { createEma44 } from "./ema44";
// Registry: adding a strategy = one new file + one line here.
export const strategies: Strategy[] = [createEma44(44)];
export function strategyById(id: string): Strategy { return strategies.find((s) => s.id === id) ?? strategies[0]; }
export { createEma44 };

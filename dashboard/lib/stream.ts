// In-process realtime fan-out: store upserts notify SSE subscribers in the same Next server.
type Listener = (info: { symbol: string; interval: string; count: number; lastT: number | null }) => void;
const listeners = new Set<Listener>();
export function notifyStore(symbol: string, interval: string, count: number, lastT: number | null) {
  for (const l of [...listeners]) { try { l({ symbol, interval, count, lastT }); } catch { /* ignore */ } }
}
export function subscribe(l: Listener): () => void { listeners.add(l); return () => { listeners.delete(l); }; }

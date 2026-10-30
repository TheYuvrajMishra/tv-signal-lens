import { NextRequest, NextResponse } from "next/server";
import { loadSet } from "@/lib/store";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") || "BTCUSDT").toUpperCase();
  const interval = req.nextUrl.searchParams.get("interval") || "1m";
  const set = await loadSet(symbol, interval);
  return new NextResponse(JSON.stringify(set, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${symbol}_${interval}.json"` },
  });
}

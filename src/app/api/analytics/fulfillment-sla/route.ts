import { NextRequest, NextResponse } from "next/server";
import { adminFetch } from "@/lib/shopify-admin";

export const runtime = "nodejs";

const FULFILL_QUERY = `
  query FULFILL($ordersQuery: String!, $first: Int!) {
    orders(first: $first, query: $ordersQuery, sortKey: CREATED_AT, reverse: false) {
      edges {
        node {
          id
          createdAt
          displayFulfillmentStatus
          fulfillments { createdAt }
        }
      }
    }
  }
`;

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a,b)=>a-b);
  const mid = Math.floor(s.length/2);
  return s.length % 2 ? s[mid] : (s[mid-1]+s[mid])/2;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shop = searchParams.get("shop");
    if (!shop) return NextResponse.json({ error: "Missing shop" }, { status: 400 });

    const end = searchParams.get("endDate") ?? new Date().toISOString().slice(0, 10);
    const start = searchParams.get("startDate") ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const ordersQuery = `created_at:>=${start} created_at:<=${end}`;
    const data = await adminFetch(shop, FULFILL_QUERY, { ordersQuery, first: 250 });

    const orders = (data.orders.edges || []).map((e: any) => e.node);

    const counts: Record<string, number> = {};
    const slas: number[] = [];

    for (const o of orders) {
      const status = o.displayFulfillmentStatus ?? 'UNFULFILLED';
      counts[status] = (counts[status] || 0) + 1;
      const f = o.fulfillments?.[0]?.createdAt;
      if (f) {
        const hours = (new Date(f).getTime() - new Date(o.createdAt).getTime()) / (1000*60*60);
        if (hours >= 0) slas.push(hours);
      }
    }

    const total = orders.length || 1;

    return NextResponse.json({
      shop,
      window: { start, end },
      statusSplit: Object.entries(counts).map(([k,v]) => ({ status: k, count: v, pct: Math.round((v/total)*100) })),
      medianSlaHours: Math.round(median(slas) * 10) / 10,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}

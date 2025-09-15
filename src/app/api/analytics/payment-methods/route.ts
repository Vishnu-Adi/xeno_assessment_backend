import { NextRequest, NextResponse } from "next/server";
import { adminFetch } from "@/lib/shopify-admin";

export const runtime = "nodejs";

const PM_QUERY = `
  query PM($ordersQuery: String!, $first: Int!) {
    orders(first: $first, query: $ordersQuery, sortKey: CREATED_AT, reverse: false) {
      edges { node { id createdAt paymentGatewayNames } }
    }
  }
`;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shop = searchParams.get("shop");
    if (!shop) return NextResponse.json({ error: "Missing shop" }, { status: 400 });

    const end = searchParams.get("endDate") ?? new Date().toISOString().slice(0, 10);
    const start = searchParams.get("startDate") ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const ordersQuery = `created_at:>=${start} created_at:<=${end}`;
    const data = await adminFetch(shop, PM_QUERY, { ordersQuery, first: 250 });

    const orders = (data.orders.edges || []).map((e: any) => e.node);
    const counts: Record<string, number> = {};

    for (const o of orders) {
      const list: string[] = o.paymentGatewayNames || [];
      if (!list.length) counts.Unknown = (counts.Unknown || 0) + 1;
      for (const g of list) counts[g] = (counts[g] || 0) + 1;
    }

    const total = orders.length || 1;
    const methods = Object.entries(counts).map(([name, count]) => ({ name, count, pct: Math.round((count/total)*100) }));

    return NextResponse.json({ shop, window: { start, end }, methods });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}

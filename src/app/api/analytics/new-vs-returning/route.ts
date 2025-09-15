import { NextRequest, NextResponse } from "next/server";
import { adminFetch } from "@/lib/shopify-admin";

export const runtime = "nodejs";

const ORDERS_QUERY = `
  query NVR($ordersQuery: String!, $first: Int!) {
    orders(first: $first, query: $ordersQuery, sortKey: CREATED_AT, reverse: false) {
      edges { node { id createdAt totalPriceSet { shopMoney { amount } } customer { id createdAt } } }
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
    const data = await adminFetch(shop, ORDERS_QUERY, { ordersQuery, first: 250 });

    const orders = (data.orders.edges || []).map((e: any) => e.node).filter((o: any) => o.customer);

    let newCount = 0, returningCount = 0, newRevenue = 0, returningRevenue = 0;

    for (const o of orders) {
      const firstSeen = new Date(o.customer.createdAt);
      const withinWindowFirstOrder = firstSeen >= new Date(start) && firstSeen <= new Date(end);
      const amt = parseFloat(o.totalPriceSet?.shopMoney?.amount || '0');
      if (withinWindowFirstOrder) { newCount++; newRevenue += amt; } else { returningCount++; returningRevenue += amt; }
    }

    const total = newCount + returningCount || 1;

    return NextResponse.json({
      shop,
      window: { start, end },
      breakdown: {
        new: { count: newCount, revenue: Math.round(newRevenue * 100) / 100, pct: Math.round((newCount / total) * 100) },
        returning: { count: returningCount, revenue: Math.round(returningRevenue * 100) / 100, pct: Math.round((returningCount / total) * 100) },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}

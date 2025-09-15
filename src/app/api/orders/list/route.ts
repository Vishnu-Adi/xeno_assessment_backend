import { NextRequest, NextResponse } from "next/server";
import { adminFetch } from "@/lib/shopify-admin";

export const runtime = "nodejs";

const ORDERS_LIST_Q = `
  query OrdersList($ordersQuery: String!, $first: Int!, $after: String, $reverse: Boolean) {
    orders(first: $first, after: $after, query: $ordersQuery, sortKey: CREATED_AT, reverse: $reverse) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          name
          createdAt
          totalPriceSet { shopMoney { amount currencyCode } }
          displayFulfillmentStatus
          paymentGatewayNames
          customer { displayName email }
        }
      }
    }
  }
`;

function buildQuery(start: string, end: string, search?: string | null, status?: string | null) {
  const parts: string[] = [];
  parts.push(`created_at:>=${start}`);
  parts.push(`created_at:<=${end}`);
  if (search) {
    const s = search.trim();
    // search by email or order name/id
    parts.push(`(email:${s} OR name:${s})`);
  }
  if (status && status !== 'all') {
    const map: Record<string,string> = { fulfilled: 'fulfilled', unfulfilled: 'unfulfilled', partial: 'partial' };
    const v = map[status] || status;
    parts.push(`fulfillment_status:${v}`);
  }
  return parts.join(' ');
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shop = searchParams.get('shop');
    if (!shop) return NextResponse.json({ error: 'Missing shop' }, { status: 400 });

    const start = searchParams.get('startDate') ?? new Date(Date.now()-7*86400000).toISOString().slice(0,10);
    const end = searchParams.get('endDate') ?? new Date().toISOString().slice(0,10);
    const search = searchParams.get('q');
    const status = searchParams.get('status'); // all|fulfilled|unfulfilled|partial
    const after = searchParams.get('after');
    const sort = (searchParams.get('sort') ?? 'desc') === 'asc' ? false : true; // reverse=true -> desc
    const pageSize = Math.min(25, Math.max(5, Number(searchParams.get('limit') ?? 10)));

    const ordersQuery = buildQuery(start, end, search, status);
    const vars: any = { ordersQuery, first: pageSize, reverse: sort };
    if (after && after !== 'undefined' && after !== 'null' && after.trim() !== '') {
      vars.after = after;
    }
    const data = await adminFetch(shop, ORDERS_LIST_Q, vars);

    const edges = data.orders.edges || [];
    const items = edges.map((e: any) => e.node).map((o: any) => ({
      id: o.id,
      name: o.name,
      createdAt: o.createdAt,
      total: parseFloat(o.totalPriceSet?.shopMoney?.amount || '0'),
      currency: o.totalPriceSet?.shopMoney?.currencyCode || 'INR',
      fulfillment: o.displayFulfillmentStatus || 'UNFULFILLED',
      gateways: o.paymentGatewayNames || [],
      customer: { name: o.customer?.displayName || 'Guest', email: o.customer?.email || '' },
    }));

    return NextResponse.json({
      shop,
      window: { start, end },
      pageInfo: data.orders.pageInfo,
      items,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 });
  }
}

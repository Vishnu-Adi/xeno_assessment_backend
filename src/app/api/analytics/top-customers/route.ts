// src/app/api/analytics/top-customers/route.ts - Real Shopify API Integration
import { NextRequest, NextResponse } from "next/server";
import { adminFetch } from "@/lib/shopify-admin";

export const runtime = "nodejs";

const TOP_CUSTOMERS_QUERY = `
  query TopCustomers($ordersQuery: String!, $first: Int!) {
    orders(first: $first, query: $ordersQuery, sortKey: CREATED_AT, reverse: false) {
      edges {
        node {
          id
          createdAt
          totalPriceSet { shopMoney { amount } }
          customer {
            id
            firstName
            lastName
            email
            createdAt
          }
        }
      }
    }
  }
`;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shop = searchParams.get("shop");
    if (!shop) return NextResponse.json({ error: "Missing shop" }, { status: 400 });

    const end = searchParams.get("endDate") ?? new Date().toISOString().slice(0, 10);
    const start = searchParams.get("startDate") ?? 
      new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const limit = Number(searchParams.get("limit") ?? 10);

    const ordersQuery = `created_at:>=${start} created_at:<=${end}`;

    // Fetch orders with customer data from Shopify Admin GraphQL
    const data = await adminFetch(shop, TOP_CUSTOMERS_QUERY, {
      ordersQuery,
      first: 250
    });

    const orders = data.orders.edges.map((e: any) => e.node).filter((order: any) => order.customer);

    // Aggregate customer data
    const customerAgg = new Map<string, {
      customerId: string;
      fullName: string;
      email: string;
      totalSpend: number;
      orderCount: number;
      avgOrderValue: number;
      customerSince: string;
      daysSinceLastOrder: number;
    }>();

    for (const order of orders) {
      if (!order.customer) continue;
      
      const customerId = order.customer.id;
      const orderValue = parseFloat(order.totalPriceSet?.shopMoney?.amount || '0');
      const orderDate = new Date(order.createdAt);
      
      const existing = customerAgg.get(customerId) ?? {
        customerId,
        fullName: `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim() || 'Unknown Customer',
        email: order.customer.email || 'No email',
        totalSpend: 0,
        orderCount: 0,
        avgOrderValue: 0,
        customerSince: order.customer.createdAt ? 
          new Date(order.customer.createdAt).toLocaleDateString('en-IN') : 'Unknown',
        daysSinceLastOrder: 0,
      };
      
      existing.totalSpend += orderValue;
      existing.orderCount += 1;
      
      // Calculate days since last order (using this order as reference)
      existing.daysSinceLastOrder = Math.floor((Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
      
      customerAgg.set(customerId, existing);
    }

    // Calculate AOV and sort by total spend
    const topCustomers = Array.from(customerAgg.values())
      .map(customer => ({
        ...customer,
        avgOrderValue: Math.round((customer.totalSpend / customer.orderCount) * 100) / 100,
        totalSpend: Math.round(customer.totalSpend * 100) / 100,
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, limit);

    // Customer segments analysis
    const allCustomersData = Array.from(customerAgg.values());
    const segments = {
      vip: allCustomersData.filter(c => c.totalSpend >= 25000).length,
      regular: allCustomersData.filter(c => c.totalSpend >= 5000 && c.totalSpend < 25000).length,
      casual: allCustomersData.filter(c => c.totalSpend < 5000).length,
    };

    const totalRevenue = allCustomersData.reduce((sum, c) => sum + c.totalSpend, 0);

    return NextResponse.json({ 
      shop, 
      window: { start, end }, 
      top: topCustomers,
      summary: {
        totalCustomersWithOrders: allCustomersData.length,
        totalUniqueCustomers: allCustomersData.length,
        segments,
        avgCustomerValue: allCustomersData.length > 0 ? 
          Math.round((totalRevenue / allCustomersData.length) * 100) / 100 : 0,
      }
    });
  } catch (err: any) {
    console.error('Shopify Top customers error:', err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
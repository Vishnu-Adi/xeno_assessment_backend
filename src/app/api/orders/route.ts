import { NextRequest, NextResponse } from 'next/server';
import { listOrders } from '@/repos/orders';
import { resolveTenantIdFromShopDomain } from '@/lib/tenant';
import { OrderStatus } from '@prisma/client';
import { safeJson } from '@/lib/json';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const shop = searchParams.get('shop');
  if (!shop) return NextResponse.json({ error: 'Missing shop' }, { status: 400 });
  const tenantId = await resolveTenantIdFromShopDomain(shop);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const statusParam = searchParams.get('status');
  const status = statusParam && Object.values(OrderStatus).includes(statusParam as OrderStatus) 
    ? (statusParam as OrderStatus) 
    : undefined;
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
  const cursor = searchParams.get('cursor') ?? undefined;
  const result = await listOrders(
    { tenantId },
    { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined, status, limit, cursor }
  );
  return NextResponse.json(safeJson(result));
}


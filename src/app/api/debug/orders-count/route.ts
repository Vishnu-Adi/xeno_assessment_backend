// app/api/debug/orders-count/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'

export async function GET(req: NextRequest) {
  const shop = new URL(req.url).searchParams.get('shop')!
  const tenantId = await resolveTenantIdFromShopDomain(shop)
  const count = await getPrisma().order.count({ where: { tenantId } })
  return NextResponse.json({ shop, count })
}

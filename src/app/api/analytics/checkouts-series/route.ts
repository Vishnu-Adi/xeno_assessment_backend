import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'
import { safeJson } from '@/lib/json'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const prisma = getPrisma()
  const url = new URL(req.url)
  const shop = url.searchParams.get('shop')
  if (!shop) return NextResponse.json({ error: 'missing shop' }, { status: 400 })
  const tenantId = await resolveTenantIdFromShopDomain(shop)

  const now = new Date()
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  let rows: { day: string; revenue: number; count: number }[] = []

  try {
    // Check both data sources
    const [checkoutCount, cartCount] = await Promise.all([
      prisma.checkout.count({ where: { tenantId } }).catch(() => 0),
      prisma.cart.count({ where: { tenantId } }).catch(() => 0)
    ])

    console.log('Series debug:', { shop, tenantId: Buffer.from(tenantId).toString('hex'), checkoutCount, cartCount })

    // Prefer cart data if available (since that's what we're seeding)
    if (cartCount > 0) {
      console.log('Using cart data for series')
      rows = await prisma.$queryRaw`
        SELECT DATE(createdAt) AS day,
               SUM(totalPrice) AS revenue,
               COUNT(*)        AS count
        FROM Cart
        WHERE tenantId = ${tenantId} AND createdAt >= ${d7}
        GROUP BY DATE(createdAt)
        ORDER BY day ASC
      `
    } else if (checkoutCount > 0) {
      console.log('Using checkout data for series')
      rows = await prisma.$queryRaw`
        SELECT DATE(createdAt) AS day,
               SUM(totalPrice) AS revenue,
               COUNT(*)        AS count
        FROM Checkout
        WHERE tenantId = ${tenantId} AND createdAt >= ${d7}
        GROUP BY DATE(createdAt)
        ORDER BY day ASC
      `
    } else {
      console.log('No data found for series')
    }
  } catch (error) {
    console.error('Series query failed:', error)
    // rows remains empty array
  }

  // Ensure all values are JSON-safe primitives
  const safeRows = rows.map(row => ({
    day: String(row.day),
    revenue: Number(row.revenue ?? 0),
    count: Number(row.count ?? 0)
  }))

  return NextResponse.json(safeRows)
}
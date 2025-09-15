import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'
import { Prisma } from '@prisma/client'
import { safeJson } from '@/lib/json'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const prisma = getPrisma()
  const url = new URL(req.url)
  const shop = url.searchParams.get('shop')
  if (!shop) return NextResponse.json({ error: 'missing shop' }, { status: 400 })
  const tenantId = await resolveTenantIdFromShopDomain(shop)

  const now = new Date()
  const d24 = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const d7  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000)

  // Always compute product KPIs
  const [productCount, newProducts7d] = await Promise.all([
    prisma.product.count({ where: { tenantId } }),
    prisma.product.count({ where: { tenantId, createdAt: { gte: d7 } } }),
  ])

  let active24h = 0
  let value24h = 0
  let completionRate7d = 0
  let source: 'checkout' | 'cart' | 'none' = 'none'
  let debugInfo: any = {}

  try {
    // Check both checkout and cart counts first for debugging
    const [checkoutCount, cartCount] = await Promise.all([
      prisma.checkout.count({ where: { tenantId } }).catch(e => ({ error: e.message, count: 0 })),
      prisma.cart.count({ where: { tenantId } }).catch(e => ({ error: e.message, count: 0 }))
    ])
    
    debugInfo = { checkoutCount, cartCount, tenantId: Buffer.from(tenantId).toString('hex') }
    console.log('Analytics debug:', debugInfo)

    // Prefer cart data if available (since that's what we're seeding)
    if (typeof cartCount === 'number' && cartCount > 0) {
      source = 'cart'
      try {
        const [created24h, sumRows, created7, updated7] = await Promise.all([
          prisma.cart.count({ where: { tenantId, createdAt: { gte: d24 } } }),
          prisma.$queryRaw<{ total: string | number | null }[]>`
            SELECT SUM(totalPrice) AS total
            FROM Cart
            WHERE tenantId = ${tenantId} AND createdAt >= ${d24}
          `,
          prisma.cart.count({ where: { tenantId, createdAt: { gte: d7 } } }),
          prisma.cart.count({ where: { tenantId, updatedAt: { gte: d7 } } }),
        ])
        active24h = created24h
        value24h = Number(sumRows?.[0]?.total ?? 0)
        completionRate7d = created7 > 0 ? Math.min(1, updated7 / created7) : 0
        
        console.log('Using cart data:', { active24h, value24h, completionRate7d })
      } catch (error) {
        console.error('Cart query failed:', error)
        source = 'none'
      }
    } else if (typeof checkoutCount === 'number' && checkoutCount > 0) {
      source = 'checkout'
      const [created24h, sum24h, created7, completed7] = await Promise.all([
        prisma.checkout.count({ where: { tenantId, createdAt: { gte: d24 } } }),
        prisma.checkout.aggregate({ where: { tenantId, createdAt: { gte: d24 } }, _sum: { totalPrice: true } }),
        prisma.checkout.count({ where: { tenantId, createdAt: { gte: d7 } } }),
        prisma.checkout.count({ where: { tenantId, completedAt: { gte: d7 } } }),
      ])
      active24h = created24h
      value24h = Number((sum24h._sum.totalPrice as Prisma.Decimal | null) ?? 0)
      completionRate7d = created7 > 0 ? completed7 / created7 : 0
      
      console.log('Using checkout data:', { active24h, value24h, completionRate7d })
    } else {
      console.log('No data found in either checkout or cart tables')
    }
  } catch (error) {
    console.error('Analytics query failed:', error)
    // Continue with zeros - will show empty dashboard
  }

  // Ensure all values are JSON-safe
  const response = {
    productCount: Number(productCount),
    newProducts7d: Number(newProducts7d),
    activeCheckouts24h: Number(active24h),
    checkoutValue24h: Number(value24h),
    completionRate7d: Number(completionRate7d),
    source
  }

  return NextResponse.json(safeJson(response))
}

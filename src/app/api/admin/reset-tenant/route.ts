import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { shop, mode = 'all', days = 30 } = await req.json()
    if (!shop) return NextResponse.json({ ok: false, error: 'missing shop' }, { status: 400 })

    const prisma = getPrisma()
    const tenantId = await resolveTenantIdFromShopDomain(shop)
    const cutoff = new Date(Date.now() - Number(days) * 86_400_000)

    const cartWhere: any = { tenantId }
    const checkoutWhere: any = { tenantId }
    if (mode === 'recent') {
      cartWhere.createdAt = { gte: cutoff }
      checkoutWhere.createdAt = { gte: cutoff }
    }

    const [carts, checkouts] = await Promise.all([
      prisma.cart.deleteMany({ where: cartWhere }),
      prisma.checkout.deleteMany({ where: checkoutWhere }),
    ])

    return NextResponse.json({ 
      ok: true, 
      deleted: { 
        carts: carts.count, 
        checkouts: checkouts.count 
      }, 
      mode,
      shop 
    })
  } catch (e: any) {
    console.error('Reset tenant error:', e)
    return NextResponse.json({ ok: false, error: e?.message ?? 'error' }, { status: 500 })
  }
}

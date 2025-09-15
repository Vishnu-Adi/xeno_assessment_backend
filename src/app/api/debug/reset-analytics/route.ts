import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const prisma = getPrisma()
  const body = await req.json()
  const { shop } = body
  
  if (!shop) {
    return NextResponse.json({ error: 'missing shop' }, { status: 400 })
  }

  const tenantId = await resolveTenantIdFromShopDomain(shop)
  
  try {
    // Delete analytics data for this tenant
    const deleteResults = await Promise.allSettled([
      prisma.cart.deleteMany({ where: { tenantId } }),
      prisma.checkout.deleteMany({ where: { tenantId } }),
      prisma.order.deleteMany({ where: { tenantId } }),
      prisma.customer.deleteMany({ where: { tenantId } }),
      // Keep products as they're from Shopify
    ])

    const deletedCounts = {
      carts: 0,
      checkouts: 0,
      orders: 0,
      customers: 0
    }

    deleteResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const count = (result.value as any)?.count || 0
        switch (index) {
          case 0: deletedCounts.carts = count; break
          case 1: deletedCounts.checkouts = count; break
          case 2: deletedCounts.orders = count; break
          case 3: deletedCounts.customers = count; break
        }
      }
    })

    return NextResponse.json({
      message: 'Analytics data reset successfully',
      deleted: deletedCounts,
      shop
    })
  } catch (error) {
    console.error('Reset failed:', error)
    return NextResponse.json({ error: 'Failed to reset data' }, { status: 500 })
  }
}
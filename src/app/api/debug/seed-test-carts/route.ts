import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'
import { Prisma } from '@prisma/client'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const prisma = getPrisma()
  const { shop = 'tenant-a-demo.myshopify.com', count = 5 } = await req.json()
  
  const tenantId = await resolveTenantIdFromShopDomain(shop)
  
  console.log('Creating test carts for:', { shop, tenantId: Buffer.from(tenantId).toString('hex'), count })
  
  const created = []
  const errors = []
  
  // Create test carts with different dates - spread across last 7 days with some in last 24h
  const now = new Date()
  
  for (let i = 0; i < count; i++) {
    try {
      // Create some carts in last 24h, others spread over 7 days
      const hoursAgo = i < Math.ceil(count / 3) 
        ? Math.random() * 24  // First 1/3 in last 24 hours
        : Math.random() * 7 * 24  // Rest spread over 7 days
      const createdAt = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000)
      const updatedAt = new Date(createdAt.getTime() + Math.random() * 60 * 60 * 1000) // Updated within an hour
      
      const cart = await prisma.cart.create({
        data: {
          tenantId,
          cartToken: `test-cart-${Date.now()}-${i}`,
          currency: 'INR',
          totalPrice: new Prisma.Decimal((Math.random() * 5000 + 100).toFixed(2)), // Random price between 100-5100
          createdAt,
          updatedAt
        }
      })
      
      created.push({
        id: cart.id.toString(),
        cartToken: cart.cartToken,
        totalPrice: cart.totalPrice.toString(),
        createdAt: cart.createdAt.toISOString(),
        updatedAt: cart.updatedAt.toISOString()
      })
      
    } catch (error) {
      console.error('Failed to create cart:', error)
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  
  // Verify the data was created
  const totalCarts = await prisma.cart.count({ where: { tenantId } })
  
  return NextResponse.json({
    ok: true,
    shop,
    tenantId: Buffer.from(tenantId).toString('hex'),
    created: created.length,
    errors,
    totalCarts,
    createdCarts: created
  })
}

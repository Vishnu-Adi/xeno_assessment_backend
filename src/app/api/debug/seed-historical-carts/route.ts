import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'
import { Prisma } from '@prisma/client'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const prisma = getPrisma()
  const { shop, days = 7 } = (await req.json()) as { shop?: string; days?: number }
  
  if (!shop) return NextResponse.json({ error: 'missing shop' }, { status: 400 })
  
  const tenantId = await resolveTenantIdFromShopDomain(shop)
  
  try {
    const createdCarts: any[] = []
    
    // Create historical cart data for the last N days
    for (let dayOffset = days; dayOffset >= 1; dayOffset--) {
      const date = new Date(Date.now() - dayOffset * 24 * 60 * 60 * 1000)
      const cartsForDay = Math.floor(Math.random() * 8) + 2 // 2-10 carts per day
      
      for (let i = 0; i < cartsForDay; i++) {
        const cartToken = `gid://shopify/Cart/historical-${Date.now()}-${dayOffset}-${i}`
        const totalPrice = new Prisma.Decimal((Math.random() * 150 + 10).toFixed(2)) // $10-$160
        const currencies = ['USD', 'INR', 'EUR']
        const currency = currencies[Math.floor(Math.random() * currencies.length)]
        
        // Randomize time within the day
        const timeOffset = Math.random() * 24 * 60 * 60 * 1000
        const createdAt = new Date(date.getTime() + timeOffset)
        
        const cart = await prisma.cart.create({
          data: {
            tenantId,
            cartToken,
            currency,
            totalPrice,
            createdAt,
            updatedAt: createdAt
          }
        })
        createdCarts.push(cart)
      }
    }
    
    return NextResponse.json({ 
      ok: true, 
      seeded: {
        carts: createdCarts.length,
        days: days,
        totalValue: createdCarts.reduce((sum, c) => sum + Number(c.totalPrice), 0)
      }
    })
    
  } catch (error) {
    console.error('Historical cart seed error:', error)
    return NextResponse.json({ error: 'seeding failed', details: String(error) }, { status: 500 })
  }
}

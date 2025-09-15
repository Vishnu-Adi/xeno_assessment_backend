import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'
import { Prisma } from '@prisma/client'

export const runtime = 'nodejs'

const REALISTIC_CUSTOMERS = [
  { firstName: 'Aarav', lastName: 'Sharma', email: 'aarav.sharma@gmail.com' },
  { firstName: 'Isha', lastName: 'Patel', email: 'isha.patel@outlook.com' },
  { firstName: 'Vihaan', lastName: 'Reddy', email: 'vihaan.reddy@yahoo.com' },
  { firstName: 'Ananya', lastName: 'Gupta', email: 'ananya.gupta@gmail.com' },
  { firstName: 'Arjun', lastName: 'Iyer', email: 'arjun.iyer@hotmail.com' },
  { firstName: 'Diya', lastName: 'Khan', email: 'diya.khan@gmail.com' },
  { firstName: 'Kabir', lastName: 'Singh', email: 'kabir.singh@outlook.com' },
  { firstName: 'Aditi', lastName: 'Nair', email: 'aditi.nair@yahoo.com' },
  { firstName: 'Ishaan', lastName: 'Mehta', email: 'ishaan.mehta@gmail.com' },
  { firstName: 'Sara', lastName: 'Bose', email: 'sara.bose@outlook.com' }
]

export async function POST(req: NextRequest) {
  const prisma = getPrisma()
  const { shop, customerCount = 6, orderCount = 8 } = (await req.json()) as { 
    shop?: string; 
    customerCount?: number; 
    orderCount?: number; 
  }
  
  if (!shop) return NextResponse.json({ error: 'missing shop' }, { status: 400 })
  
  const tenantId = await resolveTenantIdFromShopDomain(shop)
  
  try {
    // 1. Create realistic customers directly in database
    const createdCustomers: any[] = []
    for (let i = 0; i < Math.min(customerCount, REALISTIC_CUSTOMERS.length); i++) {
      const customer = REALISTIC_CUSTOMERS[i]
      const shopifyCustomerId = BigInt(8000000000000 + Math.floor(Math.random() * 999999999))
      
      const dbCustomer = await prisma.customer.upsert({
        where: { 
          tenantId_shopifyCustomerId: { 
            tenantId, 
            shopifyCustomerId 
          } 
        },
        update: {
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName
        },
        create: {
          tenantId,
          shopifyCustomerId,
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
          createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) // Random date within last 30 days
        }
      })
      createdCustomers.push(dbCustomer)
    }
    
    // 2. Create realistic orders with revenue
    const createdOrders: any[] = []
    for (let i = 0; i < orderCount; i++) {
      const customer = createdCustomers[Math.floor(Math.random() * createdCustomers.length)]
      const shopifyOrderId = BigInt(5000000000000 + Math.floor(Math.random() * 999999999))
      const totalPrice = new Prisma.Decimal((Math.random() * 200 + 20).toFixed(2)) // $20-$220
      const currencies = ['USD', 'INR', 'EUR']
      const currency = currencies[Math.floor(Math.random() * currencies.length)]
      const statuses = ['pending', 'fulfilled', 'fulfilled', 'fulfilled'] // More fulfilled orders
      const status = statuses[Math.floor(Math.random() * statuses.length)] as 'pending' | 'fulfilled' | 'cancelled'
      
      const dbOrder = await prisma.order.upsert({
        where: {
          tenantId_shopifyOrderId: {
            tenantId,
            shopifyOrderId
          }
        },
        update: {
          customerShopifyId: customer.shopifyCustomerId,
          totalPrice,
          currency,
          status
        },
        create: {
          tenantId,
          shopifyOrderId,
          customerShopifyId: customer.shopifyCustomerId,
          totalPrice,
          currency,
          status,
          createdAt: new Date(Date.now() - Math.random() * 15 * 24 * 60 * 60 * 1000) // Random date within last 15 days
        }
      })
      createdOrders.push(dbOrder)
    }
    
    return NextResponse.json({ 
      ok: true, 
      seeded: {
        customers: createdCustomers.length,
        orders: createdOrders.length,
        totalRevenue: createdOrders.reduce((sum, o) => sum + Number(o.totalPrice), 0)
      }
    })
    
  } catch (error) {
    console.error('Direct seed error:', error)
    return NextResponse.json({ error: 'seeding failed', details: String(error) }, { status: 500 })
  }
}

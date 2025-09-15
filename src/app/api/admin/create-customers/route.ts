import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'

export const runtime = 'nodejs'

const REALISTIC_CUSTOMERS = [
  { firstName: "Diya", lastName: "Khan", email: "diya.khan@example.com" },
  { firstName: "Isha", lastName: "Patel", email: "isha.patel@example.com" },
  { firstName: "Karthik", lastName: "Nair", email: "karthik.nair@example.com" },
  { firstName: "Aarav", lastName: "Shah", email: "aarav.shah@example.com" },
  { firstName: "Meera", lastName: "Reddy", email: "meera.reddy@example.com" },
  { firstName: "Arjun", lastName: "Singh", email: "arjun.singh@example.com" },
  { firstName: "Nisha", lastName: "Verma", email: "nisha.verma@example.com" },
  { firstName: "Rahul", lastName: "Menon", email: "rahul.menon@example.com" },
  { firstName: "Priya", lastName: "Gupta", email: "priya.gupta@example.com" },
  { firstName: "Vikram", lastName: "Joshi", email: "vikram.joshi@example.com" },
  { firstName: "Ananya", lastName: "Iyer", email: "ananya.iyer@example.com" },
  { firstName: "Rohan", lastName: "Desai", email: "rohan.desai@example.com" }
]

export async function POST(req: NextRequest) {
  const prisma = getPrisma()
  const body = await req.json()
  const { shop } = body
  
  if (!shop) {
    return NextResponse.json({ error: 'missing shop' }, { status: 400 })
  }

  const tenantId = await resolveTenantIdFromShopDomain(shop)
  
  try {
    // Get store access token
    const store = await prisma.store.findFirst({
      where: { shopDomain: shop },
      select: { accessToken: true }
    })

    if (!store?.accessToken) {
      return NextResponse.json({ error: 'No access token found for shop' }, { status: 400 })
    }

    const createdCustomers = []
    
    for (const customer of REALISTIC_CUSTOMERS) {
      try {
        const response = await fetch(`https://${shop}/admin/api/2024-10/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': store.accessToken,
          },
          body: JSON.stringify({
            query: `
              mutation customerCreate($input: CustomerInput!) {
                customerCreate(input: $input) {
                  customer {
                    id
                    email
                    firstName
                    lastName
                    createdAt
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `,
            variables: {
              input: {
                email: customer.email,
                firstName: customer.firstName,
                lastName: customer.lastName,
                acceptsMarketing: false,
                tags: ["seeded", "xeno", "realistic"]
              }
            }
          })
        })

        if (response.ok) {
          const data = await response.json()
          if (data.data?.customerCreate?.customer) {
            const shopifyCustomer = data.data.customerCreate.customer
            
            // Store in local DB
            await prisma.customer.upsert({
              where: {
                tenantId_shopifyCustomerId: {
                  tenantId,
                  shopifyCustomerId: shopifyCustomer.id
                }
              },
              update: {
                email: shopifyCustomer.email,
                firstName: shopifyCustomer.firstName,
                lastName: shopifyCustomer.lastName,
                updatedAt: new Date()
              },
              create: {
                tenantId,
                shopifyCustomerId: shopifyCustomer.id,
                email: shopifyCustomer.email,
                firstName: shopifyCustomer.firstName,
                lastName: shopifyCustomer.lastName,
                createdAt: new Date(shopifyCustomer.createdAt),
                updatedAt: new Date()
              }
            })
            
            createdCustomers.push({
              shopifyId: shopifyCustomer.id,
              name: `${shopifyCustomer.firstName} ${shopifyCustomer.lastName}`,
              email: shopifyCustomer.email
            })
          } else if (data.data?.customerCreate?.userErrors?.length > 0) {
            console.log(`Customer creation failed for ${customer.email}:`, data.data.customerCreate.userErrors)
          }
        }
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 200))
      } catch (error) {
        console.error(`Failed to create customer ${customer.email}:`, error)
      }
    }

    return NextResponse.json({
      message: `Created ${createdCustomers.length} customers`,
      customers: createdCustomers
    })
  } catch (error) {
    console.error('Customer creation failed:', error)
    return NextResponse.json({ error: 'Failed to create customers' }, { status: 500 })
  }
}

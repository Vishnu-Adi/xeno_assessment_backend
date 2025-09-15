import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const prisma = getPrisma()
  const body = await req.json()
  const { shop, count = 15 } = body
  
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

    // Get local customers for this tenant
    const customers = await prisma.customer.findMany({
      where: { tenantId },
      select: { shopifyCustomerId: true, email: true, firstName: true, lastName: true }
    })

    if (customers.length === 0) {
      return NextResponse.json({ error: 'No customers found. Create customers first.' }, { status: 400 })
    }

    // Get active product variants from Shopify
    const variantsResponse = await fetch(`https://${shop}/admin/api/2024-10/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': store.accessToken,
      },
      body: JSON.stringify({
        query: `{
          products(first: 50, query: "status:active") {
            edges {
              node {
                id
                title
                variants(first: 25) {
                  edges {
                    node {
                      id
                      title
                      price
                    }
                  }
                }
              }
            }
          }
        }`
      })
    })

    if (!variantsResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
    }

    const variantsData = await variantsResponse.json()
    const variants = variantsData.data?.products?.edges?.flatMap((product: any) => 
      product.node.variants.edges.map((variant: any) => variant.node)
    ) || []

    if (variants.length === 0) {
      return NextResponse.json({ error: 'No product variants found' }, { status: 400 })
    }

    const createdOrders = []
    
    for (let i = 0; i < count; i++) {
      try {
        // Pick random customer and variants
        const customer = customers[Math.floor(Math.random() * customers.length)]
        const numItems = Math.floor(Math.random() * 3) + 1 // 1-3 items
        const selectedVariants = []
        
        for (let j = 0; j < numItems; j++) {
          const variant = variants[Math.floor(Math.random() * variants.length)]
          const quantity = Math.floor(Math.random() * 2) + 1 // 1-2 quantity
          selectedVariants.push({ variantId: variant.id, quantity })
        }

        // Create draft order
        const draftResponse = await fetch(`https://${shop}/admin/api/2024-10/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': store.accessToken,
          },
          body: JSON.stringify({
            query: `
              mutation draftOrderCreate($input: DraftOrderInput!) {
                draftOrderCreate(input: $input) {
                  draftOrder {
                    id
                    invoiceUrl
                    totalPrice
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
                lineItems: selectedVariants,
                useCustomerDefaultAddress: true,
                tags: ["seeded", "xeno", "realistic"],
                customerId: customer.shopifyCustomerId
              }
            }
          })
        })

        if (draftResponse.ok) {
          const draftData = await draftResponse.json()
          const draftOrder = draftData.data?.draftOrderCreate?.draftOrder
          
          if (draftOrder && !draftData.data?.draftOrderCreate?.userErrors?.length) {
            // Complete the draft order to make it a real order
            const completeResponse = await fetch(`https://${shop}/admin/api/2024-10/graphql.json`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': store.accessToken,
              },
              body: JSON.stringify({
                query: `
                  mutation draftOrderComplete($id: ID!) {
                    draftOrderComplete(id: $id) {
                      draftOrder {
                        id
                        order {
                          id
                          name
                          totalPriceSet {
                            shopMoney {
                              amount
                              currencyCode
                            }
                          }
                          createdAt
                          customer {
                            id
                            email
                          }
                          lineItems(first: 10) {
                            edges {
                              node {
                                id
                                quantity
                                variant {
                                  id
                                  product {
                                    id
                                    title
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                      userErrors {
                        field
                        message
                      }
                    }
                  }
                `,
                variables: { id: draftOrder.id }
              })
            })

            if (completeResponse.ok) {
              const completeData = await completeResponse.json()
              const order = completeData.data?.draftOrderComplete?.draftOrder?.order
              
              if (order) {
                // Store order in local DB
                await prisma.order.upsert({
                  where: {
                    tenantId_shopifyOrderId: {
                      tenantId,
                      shopifyOrderId: order.id
                    }
                  },
                  update: {
                    totalPrice: parseFloat(order.totalPriceSet.shopMoney.amount),
                    status: 'fulfilled',
                    updatedAt: new Date()
                  },
                  create: {
                    tenantId,
                    shopifyOrderId: order.id,
                    totalPrice: parseFloat(order.totalPriceSet.shopMoney.amount),
                    currency: order.totalPriceSet.shopMoney.currencyCode,
                    status: 'fulfilled',
                    customerShopifyId: order.customer?.id,
                    createdAt: new Date(order.createdAt),
                    updatedAt: new Date()
                  }
                })

                createdOrders.push({
                  shopifyOrderId: order.id,
                  orderName: order.name,
                  totalPrice: order.totalPriceSet.shopMoney.amount,
                  customer: order.customer?.email,
                  itemCount: order.lineItems.edges.length
                })
              }
            }
          }
        }
        
        // Delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500))
      } catch (error) {
        console.error(`Failed to create order ${i + 1}:`, error)
      }
    }

    return NextResponse.json({
      message: `Created ${createdOrders.length} orders`,
      orders: createdOrders
    })
  } catch (error) {
    console.error('Order creation failed:', error)
    return NextResponse.json({ error: 'Failed to create orders' }, { status: 500 })
  }
}

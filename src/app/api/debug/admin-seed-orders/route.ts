import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * Creates draft orders and completes them to generate real Orders data.
 * Body: { shop: string; count?: number; accessToken?: string }
 */
export async function POST(req: NextRequest) {
  const prisma = getPrisma()
  const { shop, count = 3, accessToken: bodyToken } = (await req.json()) as { shop?: string; count?: number; accessToken?: string }
  if (!shop) return NextResponse.json({ error: 'missing shop' }, { status: 400 })

  let accessToken = bodyToken as string | undefined
  if (!accessToken) {
    const store = await prisma.store.findFirst({ where: { shopDomain: shop } })
    accessToken = store?.accessToken
  }
  if (!accessToken) return NextResponse.json({ error: 'missing accessToken' }, { status: 400 })

  const endpoint = `https://${shop}/admin/api/2024-10/graphql.json`

  // Pick a product variant and some customers via Admin GraphQL
  const q = `
    query SeedPrereqs {
      products(first: 1, query: "status:active") {
        edges { node { variants(first: 1) { edges { node { id } } } } }
      }
      customers(first: 10, sortKey: CREATED_AT, reverse: true) { 
        edges { node { id } } 
      }
    }
  `
  const qRes = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
    body: JSON.stringify({ query: q })
  })
  if (!qRes.ok) return NextResponse.json({ error: 'admin_query_error', status: qRes.status, text: await qRes.text() }, { status: 502 })
  const qJson = await qRes.json()
  const variantId = qJson?.data?.products?.edges?.[0]?.node?.variants?.edges?.[0]?.node?.id
  const customerIds: string[] = (qJson?.data?.customers?.edges ?? []).map((e: any) => e?.node?.id).filter(Boolean)
  if (!variantId) return NextResponse.json({ error: 'no_variant_found' }, { status: 400 })

  const results: string[] = []
  const errors: string[] = []

  for (let i = 0; i < Number(count); i++) {
    // Create a draft order
    const createDraft = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder { id }
          userErrors { field message }
        }
      }
    `
    const customerId = customerIds.length ? customerIds[i % customerIds.length] : undefined
    const dRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
      body: JSON.stringify({ query: createDraft, variables: { input: { lineItems: [{ variantId, quantity: 1 }], ...(customerId ? { customerId } : {}) } } })
    })
    const dJson = await dRes.json()
    const draftId = dJson?.data?.draftOrderCreate?.draftOrder?.id
    const derr = dJson?.data?.draftOrderCreate?.userErrors?.map((e: any) => e.message) ?? []
    if (!draftId) { errors.push(...derr); continue }

    // Complete the draft order (creates an Order)
    const complete = `
      mutation draftOrderComplete($id: ID!, $paymentPending: Boolean!) {
        draftOrderComplete(id: $id, paymentPending: $paymentPending) {
          draftOrder { id }
          userErrors { field message }
        }
      }
    `
    const cRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
      body: JSON.stringify({ query: complete, variables: { id: draftId, paymentPending: false } })
    })
    const cJson = await cRes.json()
    const cerr = cJson?.data?.draftOrderComplete?.userErrors?.map((e: any) => e.message) ?? []
    if (cerr.length) errors.push(...cerr)
    else results.push(draftId)
  }

  return NextResponse.json({ ok: true, created: results, errors })
}



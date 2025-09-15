// src/app/api/debug/seed-carts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'
import { resolveTenantIdFromShopDomain } from '@/lib/tenant'
export const runtime = 'nodejs'

function sfoTokenFor(shop: string) {
  if (shop === 'tenant-a-demo.myshopify.com') return process.env.STOREFRONT_TOKEN_TENANT_A!
  if (shop === 'tenant-b-demo.myshopify.com') return process.env.STOREFRONT_TOKEN_TENANT_B!
  throw new Error(`No storefront token configured for ${shop}`)
}

export async function POST(req: NextRequest) {
  const { shop, count = 5, token: tokenFromBody } = (await req.json()) as { shop: string; count?: number; token?: string }
  if (!shop) return NextResponse.json({ error: 'missing shop' }, { status: 400 })

  const token = tokenFromBody || sfoTokenFor(shop)
  const endpoint = `https://${shop}/api/2024-10/graphql.json`
  const prisma = getPrisma()
  const tenantId = await resolveTenantIdFromShopDomain(shop)

  // 1) storefront-visible variant
  const q = `
    query {
      products(first: 1, query: "status:active") {
        edges { node { variants(first: 1) { edges { node { id } } } } }
      }
    }
  `
  const qRes = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': token },
    body: JSON.stringify({ query: q })
  })
  const qJson = await qRes.json()
  const variantId = qJson?.data?.products?.edges?.[0]?.node?.variants?.edges?.[0]?.node?.id
  if (!variantId) {
    return NextResponse.json({ error: 'No storefront-visible variant found. Ensure products are Published & Available on Online Store.', raw: qJson }, { status: 400 })
  }

  // 2) create carts (returns checkoutUrl)
  const mutation = `
    mutation cartCreate($lines: [CartLineInput!]) {
      cartCreate(input: { lines: $lines }) {
        cart { id checkoutUrl estimatedCost { totalAmount { amount currencyCode } } }
        userErrors { field message }
      }
    }
  `
  const created: string[] = []
  const errors: string[] = []

  for (let i = 0; i < Number(count); i++) {
    const mRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': token },
      body: JSON.stringify({ query: mutation, variables: { lines: [{ merchandiseId: variantId, quantity: 1 }] } })
    })
    const mJson = await mRes.json()
    const cart = mJson?.data?.cartCreate?.cart
    const url = cart?.checkoutUrl
    const cartId = cart?.id
    const amount = Number(cart?.estimatedCost?.totalAmount?.amount ?? 0)
    const currency = cart?.estimatedCost?.totalAmount?.currencyCode ?? 'USD'
    const uerr = mJson?.data?.cartCreate?.userErrors?.map((e: any) => e.message) ?? []
    if (url) created.push(url)
    if (uerr.length) errors.push(...uerr)
    if (mJson?.errors) errors.push(...mJson.errors.map((e: any) => e.message))

    // Persist a synthetic cart row so dashboard activates even without Admin webhooks
    if (cartId) {
      try {
        await prisma.cart.upsert({
          where: { tenantId_cartToken: { tenantId, cartToken: cartId } },
          update: { currency, totalPrice: amount.toString() },
          create: { tenantId, cartToken: cartId, currency, totalPrice: amount.toString(), createdAt: new Date() }
        })
      } catch (e) {
        // ignore write errors in seeding
      }
    }
  }

  return NextResponse.json({ ok: true, created, errors })
}

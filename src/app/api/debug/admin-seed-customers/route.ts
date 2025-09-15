import { NextRequest, NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const prisma = getPrisma()
  const { shop, count = 5, accessToken: bodyToken } = (await req.json()) as { shop?: string; count?: number; accessToken?: string }
  if (!shop) return NextResponse.json({ error: 'missing shop' }, { status: 400 })

  let accessToken = bodyToken as string | undefined
  if (!accessToken) {
    const store = await prisma.store.findFirst({ where: { shopDomain: shop } })
    accessToken = store?.accessToken
  }
  if (!accessToken) return NextResponse.json({ error: 'missing accessToken' }, { status: 400 })

  const endpoint = `https://${shop}/admin/api/2024-10/graphql.json`

  const firstNames = ['Aarav','Isha','Vihaan','Ananya','Arjun','Diya','Kabir','Aditi','Ishaan','Sara']
  const lastNames = ['Sharma','Patel','Reddy','Gupta','Iyer','Khan','Singh','Nair','Mehta','Bose']

  const results: Array<{ email: string; ok: boolean; error?: string }> = []
  for (let i = 0; i < Number(count); i++) {
    const fn = firstNames[Math.floor(Math.random() * firstNames.length)]
    const ln = lastNames[Math.floor(Math.random() * lastNames.length)]
    const email = `${fn}.${ln}.${Date.now()}${i}@example.com`.toLowerCase()
    const mutation = `
      mutation customerCreate($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer { id email firstName lastName createdAt }
          userErrors { field message }
        }
      }
    `
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
      body: JSON.stringify({
        query: mutation,
        variables: { input: { email, firstName: fn, lastName: ln } }
      })
    })
    if (!res.ok) {
      results.push({ email, ok: false, error: `http ${res.status}` })
      continue
    }
    const json = await res.json()
    const err = json?.data?.customerCreate?.userErrors?.[0]?.message || json?.errors?.[0]?.message
    results.push({ email, ok: !err, error: err })
  }

  return NextResponse.json({ ok: true, seeded: results })
}



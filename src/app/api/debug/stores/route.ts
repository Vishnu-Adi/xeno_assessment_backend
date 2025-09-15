// src/app/api/debug/stores/route.ts
import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/db'
export const runtime = 'nodejs'
export async function GET() {
  const stores = await getPrisma().store.findMany({ select: { shopDomain: true, createdAt: true } })
  return NextResponse.json({ stores })
}

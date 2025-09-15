import { NextRequest, NextResponse } from "next/server";
import { adminFetch } from "@/lib/shopify-admin";

export const runtime = "nodejs";

const ORDERS_Q = `
  query ORDERS($query:String!, $first:Int!){
    orders(first:$first, query:$query, sortKey:CREATED_AT, reverse:false){
      edges{ node{ id createdAt displayFulfillmentStatus } }
    }
  }
`;

const ORDER_FO_Q = `
  query FO($id:ID!){
    order(id:$id){ id fulfillmentOrders(first:10){ nodes{ id lineItems(first:50){ nodes{ id remainingQuantity } } } } }
  }
`;

const FULFILL_MUT = `
  mutation FULFILL($fulfillment: FulfillmentV2Input!, $message: String){
    fulfillmentCreateV2(fulfillment:$fulfillment, message:$message){
      fulfillment{ id status }
      userErrors{ field message }
    }
  }
`;

function delay(ms:number){ return new Promise(res=>setTimeout(res,ms)) }

export async function POST(req: NextRequest){
  try{
    const { searchParams } = new URL(req.url)
    const shop = searchParams.get('shop')
    const percent = Math.min(100, Math.max(0, Number(searchParams.get('percent') ?? 80)))
    const days = Math.min(60, Math.max(1, Number(searchParams.get('days') ?? 14)))
    if(!shop) return NextResponse.json({ error: 'Missing shop' }, { status: 400 })

    const startISO = new Date(Date.now() - days*86400000).toISOString().slice(0,10)
    const endISO = new Date().toISOString().slice(0,10)
    const q = `created_at:>=${startISO} created_at:<=${endISO}`

    const data = await adminFetch(shop, ORDERS_Q, { query: q, first: 100 })
    const orders: any[] = (data.orders.edges||[]).map((e:any)=>e.node).filter((o:any)=>o.displayFulfillmentStatus !== 'FULFILLED')
    const toFulfill = orders.filter(()=>Math.random()*100 < percent)

    let updated = 0
    for(const o of toFulfill){
      const foData = await adminFetch(shop, ORDER_FO_Q, { id: o.id })
      const fos = foData.order?.fulfillmentOrders?.nodes || []
      if(!fos.length){ await delay(400); continue }

      const lineItemsByFulfillmentOrder = fos.map((fo:any)=>({
        fulfillmentOrderId: fo.id,
        fulfillmentOrderLineItems: (fo.lineItems?.nodes||[]).map((li:any)=>({ id: li.id, quantity: Math.max(1, li.remainingQuantity || 1) }))
      }))

      const fulfillment = { lineItemsByFulfillmentOrder, notifyCustomer: false }
      const res = await adminFetch(shop, FULFILL_MUT, { fulfillment, message: "Demo auto-fulfillment" })
      const errs = res.fulfillmentCreateV2?.userErrors
      if(!errs?.length){ updated++ }
      await delay(650)
    }

    return NextResponse.json({ shop, start: startISO, end: endISO, attempted: toFulfill.length, fulfilled: updated })
  }catch(err:any){
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 })
  }
}

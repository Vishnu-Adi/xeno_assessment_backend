import { NextRequest, NextResponse } from "next/server";
import { adminFetch } from "@/lib/shopify-admin";

export const runtime = "nodejs";

const PRODUCTS_Q = `
  query P($first:Int!){
    products(first:$first){
      edges{ node{ id title variants(first:5){ edges{ node{ id } } } } }
    }
  }
`;

const CUSTOMERS_Q = `
  query C($first:Int!){
    customers(first:$first){ edges{ node{ id firstName lastName email createdAt } } }
  }
`;

const CUSTOMER_CREATE = `
  mutation customerCreate($input: CustomerInput!){
    customerCreate(input:$input){ customer{ id email firstName lastName } userErrors{ field message } }
  }
`;

const DRAFT_CREATE = `
  mutation draftOrderCreate($input: DraftOrderInput!){
    draftOrderCreate(input:$input){ draftOrder{ id } userErrors{ field message } }
  }
`;

const DRAFT_COMPLETE = `
  mutation draftOrderComplete($id: ID!, $paymentPending: Boolean){
    draftOrderComplete(id:$id, paymentPending:$paymentPending){
      draftOrder{ id order{ id } }
      userErrors{ field message }
    }
  }
`;

function randInt(min:number,max:number){ return Math.floor(Math.random()*(max-min+1))+min }
function delay(ms:number){ return new Promise(res=>setTimeout(res,ms)) }

const FIRST_NAMES = ["Aarav","Vivaan","Aditya","Ishaan","Reyansh","Ananya","Diya","Aditi","Riya","Sara","Kabir","Arjun","Ayaan","Myra","Karan","Zara"]; 
const LAST_NAMES = ["Sharma","Verma","Singh","Kumar","Gupta","Kapoor","Iyer","Rao","Nair","Menon","Mehta","Patel","Reddy","Das","Bose","Roy"]; 

function genName(){ const f = FIRST_NAMES[randInt(0,FIRST_NAMES.length-1)]; const l = LAST_NAMES[randInt(0,LAST_NAMES.length-1)]; return {firstName:f,lastName:l} }

export async function POST(req: NextRequest){
  try{
    const { searchParams } = new URL(req.url)
    const shop = searchParams.get('shop')
    const targetCustomers = Number(searchParams.get('customers') ?? 40)
    const ordersToCreate = Number(searchParams.get('orders') ?? 25)
    if(!shop) return NextResponse.json({error:'Missing shop'}, {status:400})

    // 1) Load base data
    const [pData, cData] = await Promise.all([
      adminFetch(shop, PRODUCTS_Q, { first: 30 }),
      adminFetch(shop, CUSTOMERS_Q, { first: 150 })
    ])
    const products = (pData.products.edges||[]).map((e:any)=>({
      id: e.node.id,
      variants: (e.node.variants.edges||[]).map((v:any)=>v.node.id)
    })).filter((p:any)=>p.variants.length)
    let customers = (cData.customers.edges||[]).map((e:any)=>e.node)

    // 2) Top-up customers if needed
    let createdCustomers = 0
    while(customers.length < targetCustomers){
      const {firstName,lastName} = genName()
      const suffix = Date.now().toString().slice(-7) + randInt(10,99)
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${suffix}@example.com`
      const res = await adminFetch(shop, CUSTOMER_CREATE, { input: { firstName, lastName, email, tags:["seed","demo"] } })
      const errs = res.customerCreate.userErrors
      if(!errs?.length){
        customers.push(res.customerCreate.customer)
        createdCustomers++
      }
      await delay(650)
      if(createdCustomers >= 50) break // safety
    }

    // 3) Create draft orders and complete
    let createdOrders = 0
    for(let i=0; i<ordersToCreate; i++){
      if(!products.length || !customers.length) break
      const cust = customers[randInt(0, customers.length-1)]
      const itemsCount = randInt(1,2)
      const lineItems = [] as any[]
      for(let j=0;j<itemsCount;j++){
        const p = products[randInt(0, products.length-1)]
        const variantId = p.variants[randInt(0, p.variants.length-1)]
        lineItems.push({ variantId, quantity: randInt(1,2) })
      }
      const draft = await adminFetch(shop, DRAFT_CREATE, { input: { customerId: cust.id, lineItems, tags:["seed","demo"], note:"Assessment seed order" } })
      const draftId = draft.draftOrderCreate?.draftOrder?.id
      if(!draftId){ await delay(800); continue }
      await delay(800)
      const comp = await adminFetch(shop, DRAFT_COMPLETE, { id: draftId, paymentPending: false })
      if(comp.draftOrderComplete?.draftOrder?.order?.id){ createdOrders++ }
      await delay(900)
    }

    return NextResponse.json({ shop, created: { customers: createdCustomers, orders: createdOrders } })
  }catch(err:any){
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 })
  }
}

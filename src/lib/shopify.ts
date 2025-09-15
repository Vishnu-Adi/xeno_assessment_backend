// src/lib/shopify.ts
import { getPrisma } from "@/lib/db";

export async function getAdminTokenForShop(shop: string) {
  const prisma = getPrisma();
  const store = await prisma.store.findFirst({ where: { shopDomain: shop } });
  if (!store?.accessToken) throw new Error(`No admin access token for ${shop}`);
  return store.accessToken;
}

// basic Admin GraphQL POST
export async function adminGraphQL<T>(shop: string, query: string, variables?: Record<string, any>): Promise<T> {
  const token = await getAdminTokenForShop(shop);
  const API_VER = "2024-10";
  const res = await fetch(`https://${shop}/admin/api/${API_VER}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    // keep node runtime
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Shopify GraphQL error (${res.status}): ${txt}`);
  }
  return res.json() as Promise<T>;
}

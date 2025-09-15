// src/lib/shopify-api-migration.ts
// Shopify API Migration Helper - Ensures compliance with 2024-04 API changes
// Public Apps: Must migrate by Feb 1st, 2025
// Custom Apps: Must migrate by April 1st, 2025

export interface ShopifyApiConfig {
  shop: string
  accessToken: string
  apiVersion?: string
}

/**
 * Extract numeric ID from Shopify GraphQL Global ID
 * Example: gid://shopify/Product/123456789 -> 123456789
 */
export function extractNumericId(globalId: string | number): string {
  if (typeof globalId === 'number') {
    return String(globalId)
  }
  
  if (typeof globalId === 'string') {
    if (globalId.includes('gid://shopify/')) {
      return globalId.split('/').pop() || globalId
    }
    return globalId
  }
  
  return String(globalId)
}

/**
 * Create GraphQL Global ID from numeric ID
 * Example: (Product, 123456789) -> gid://shopify/Product/123456789
 */
export function createGlobalId(resourceType: string, numericId: string | number): string {
  return `gid://shopify/${resourceType}/${numericId}`
}

/**
 * Make GraphQL API request to Shopify
 * Uses the new 2024-10 API version with GraphQL
 */
export async function shopifyGraphQL(
  config: ShopifyApiConfig,
  query: string,
  variables?: Record<string, any>
) {
  const { shop, accessToken, apiVersion = '2024-10' } = config
  
  const response = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  })

  if (!response.ok) {
    throw new Error(`GraphQL API error: ${response.status} ${response.statusText}`)
  }

  const result = await response.json()
  
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`)
  }

  return result.data
}

/**
 * Fetch products using new GraphQL Product APIs
 * Replaces deprecated REST /admin/api/products.json
 */
export async function fetchProductsGraphQL(
  config: ShopifyApiConfig,
  options: {
    first?: number
    after?: string
    query?: string
  } = {}
) {
  const { first = 50, after, query: searchQuery } = options
  
  const query = `
    query getProducts($first: Int!, $after: String, $query: String) {
      products(first: $first, after: $after, query: $query) {
        edges {
          node {
            id
            title
            handle
            status
            createdAt
            updatedAt
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  price
                  sku
                  inventoryQuantity
                }
              }
            }
          }
          cursor
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `

  const variables = {
    first,
    ...(after && { after }),
    ...(searchQuery && { query: searchQuery })
  }

  return shopifyGraphQL(config, query, variables)
}

/**
 * Create product using new GraphQL productCreate mutation
 * Replaces deprecated REST POST /admin/api/products.json
 */
export async function createProductGraphQL(
  config: ShopifyApiConfig,
  productInput: {
    title: string
    handle?: string
    status?: 'ACTIVE' | 'ARCHIVED' | 'DRAFT'
    variants?: Array<{
      title?: string
      price?: string
      sku?: string
      inventoryQuantity?: number
    }>
  }
) {
  const mutation = `
    mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          title
          handle
          status
          createdAt
          updatedAt
        }
        userErrors {
          field
          message
        }
      }
    }
  `

  const variables = {
    input: productInput
  }

  return shopifyGraphQL(config, mutation, variables)
}

/**
 * Update product using new GraphQL productUpdate mutation  
 * Replaces deprecated REST PUT /admin/api/products/{id}.json
 */
export async function updateProductGraphQL(
  config: ShopifyApiConfig,
  productId: string,
  productInput: {
    title?: string
    handle?: string
    status?: 'ACTIVE' | 'ARCHIVED' | 'DRAFT'
  }
) {
  const globalId = productId.includes('gid://') ? productId : createGlobalId('Product', productId)
  
  const mutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
          handle
          status
          updatedAt
        }
        userErrors {
          field
          message
        }
      }
    }
  `

  const variables = {
    input: {
      id: globalId,
      ...productInput
    }
  }

  return shopifyGraphQL(config, mutation, variables)
}

/**
 * Delete product using new GraphQL productDelete mutation
 * Replaces deprecated REST DELETE /admin/api/products/{id}.json  
 */
export async function deleteProductGraphQL(
  config: ShopifyApiConfig,
  productId: string
) {
  const globalId = productId.includes('gid://') ? productId : createGlobalId('Product', productId)
  
  const mutation = `
    mutation productDelete($input: ProductDeleteInput!) {
      productDelete(input: $input) {
        deletedProductId
        userErrors {
          field
          message
        }
      }
    }
  `

  const variables = {
    input: {
      id: globalId
    }
  }

  return shopifyGraphQL(config, mutation, variables)
}

/**
 * Check if the current app is compliant with the migration deadline
 */
export function checkMigrationCompliance(): {
  isCompliant: boolean
  deadline: string
  daysRemaining: number
  appType: 'public' | 'custom'
} {
  const now = new Date()
  const publicDeadline = new Date('2025-02-01')
  const customDeadline = new Date('2025-04-01')
  
  // Determine app type based on environment (simplified logic)
  const appType = process.env.SHOPIFY_APP_TYPE === 'public' ? 'public' : 'custom'
  const deadline = appType === 'public' ? publicDeadline : customDeadline
  
  const daysRemaining = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const isCompliant = daysRemaining > 0
  
  return {
    isCompliant,
    deadline: deadline.toISOString().split('T')[0],
    daysRemaining: Math.max(0, daysRemaining),
    appType
  }
}

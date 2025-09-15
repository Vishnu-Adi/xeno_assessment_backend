import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';

export async function GET(req: NextRequest) {
  const env = getEnv();
  const { searchParams } = new URL(req.url);
  const shop = searchParams.get('shop');
  if (!shop) return NextResponse.json({ error: 'Missing shop' }, { status: 400 });
  const redirectUri = `${env.SHOPIFY_APP_URL}${env.SHOPIFY_REDIRECT_PATH}`;
  const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  authUrl.searchParams.set('client_id', env.SHOPIFY_API_KEY);
  authUrl.searchParams.set('scope', env.SHOPIFY_SCOPES);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  // Optional: add state for CSRF; for brevity, omit persistence in this scaffold
  authUrl.searchParams.set('state', Math.random().toString(36).slice(2));
  return NextResponse.redirect(authUrl.toString());
}



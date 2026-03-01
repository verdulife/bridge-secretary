import type { APIRoute } from 'astro';
import { turso } from '../../../../lib/turso';

export const GET: APIRoute = async ({ url, redirect }) => {
  const code = url.searchParams.get('code');
  const chatId = url.searchParams.get('state');

  if (!code || !chatId) {
    return new Response('Missing code or state', { status: 400 });
  }

  const clientId = import.meta.env.GOOGLE_CLIENT_ID;
  const clientSecret = import.meta.env.GOOGLE_CLIENT_SECRET;
  const isLocal = url.host.includes('localhost:4321');
  const baseUrl = isLocal ? `http://localhost:4321` : `https://bridge-dashboard-six.vercel.app`;
  const redirectUri = `${baseUrl}/api/auth/callback/google`;

  try {
    // Exchange code for access token
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Google Auth Error:', data);
      return new Response('Auth Failed', { status: 500 });
    }

    // Save token to Turso
    await turso.execute({
      sql: "UPDATE users SET google_token = ? WHERE id = ?",
      args: [JSON.stringify(data), chatId],
    });

    return redirect(`/dashboard?chatId=${chatId}&success=google`);
  } catch (error) {
    console.error('❌ Google Callback Error:', error);
    return new Response('Final Auth Error', { status: 500 });
  }
};

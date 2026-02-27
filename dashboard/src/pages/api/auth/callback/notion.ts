import type { APIRoute } from 'astro';
import { turso } from '../../../../lib/turso';

export const GET: APIRoute = async ({ url, redirect }) => {
  const code = url.searchParams.get('code');
  const chatId = url.searchParams.get('state');

  if (!code || !chatId) {
    return new Response('Missing code or state', { status: 400 });
  }

  const clientId = import.meta.env.NOTION_CLIENT_ID;
  const clientSecret = import.meta.env.NOTION_CLIENT_SECRET;
  const redirectUri = `https://${url.host}/api/auth/callback/notion`;

  try {
    // Exchange code for access token
    const response = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Notion Auth Error:', data);
      return new Response('Auth Failed', { status: 500 });
    }

    // Save token to Turso
    await turso.execute({
      sql: "UPDATE users SET notion_token = ? WHERE id = ?",
      args: [JSON.stringify(data), chatId],
    });

    return redirect(`/dashboard?chatId=${chatId}&success=notion`);
  } catch (error) {
    console.error('❌ Notion Callback Error:', error);
    return new Response('Final Auth Error', { status: 500 });
  }
};

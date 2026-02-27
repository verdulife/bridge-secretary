import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url, redirect }) => {
  const chatId = url.searchParams.get('chatId');
  if (!chatId) return new Response('Missing chatId', { status: 400 });

  const clientId = import.meta.env.NOTION_CLIENT_ID;
  const redirectUri = `https://${url.host}/api/auth/callback/notion`;

  // Notion OAuth URL
  const notionAuthUrl = `https://api.notion.com/v1/oauth/authorize?owner=user&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${chatId}`;

  return redirect(notionAuthUrl);
};

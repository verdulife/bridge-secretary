import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url, redirect }) => {
  const chatId = url.searchParams.get('chatId');
  if (!chatId) return new Response('Missing chatId', { status: 400 });

  const clientId = import.meta.env.GOOGLE_CLIENT_ID;
  const redirectUri = `https://${url.host}/api/auth/callback/google`;

  // Google OAuth Scopes (Gmail read/send)
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.profile'
  ].join(' ');

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${chatId}&access_type=offline&prompt=consent`;

  return redirect(googleAuthUrl);
};

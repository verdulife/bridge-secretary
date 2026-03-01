import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url, redirect }) => {
  const chatId = url.searchParams.get('chatId');
  if (!chatId) return new Response('Missing chatId', { status: 400 });

  const clientId = import.meta.env.GOOGLE_CLIENT_ID;
  const isLocal = url.host.includes('localhost:4321');
  const baseUrl = isLocal ? `http://localhost:4321` : `https://bridge-dashboard-six.vercel.app`;
  const redirectUri = `${baseUrl}/api/auth/callback/google`;

  // Google OAuth Scopes (Synchronized with Cloud Console)
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/contacts.readonly',
    'https://www.googleapis.com/auth/userinfo.profile'
  ].join(' ');

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${chatId}&access_type=offline&prompt=consent`;

  return redirect(googleAuthUrl);
};

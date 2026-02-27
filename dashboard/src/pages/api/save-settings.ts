import type { APIRoute } from 'astro';
import { turso } from '../../lib/turso';

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const chatId = formData.get('chatId');
  const firstName = formData.get('first_name');

  if (!chatId) {
    return new Response('Missing chatId', { status: 400 });
  }

  try {
    await turso.execute({
      sql: "UPDATE users SET first_name = ? WHERE id = ?",
      args: [firstName, chatId],
    });

    return redirect(`/dashboard?chatId=${chatId}&success=true`);
  } catch (error) {
    console.error('❌ Error saving settings:', error);
    return new Response('Error saving settings', { status: 500 });
  }
};

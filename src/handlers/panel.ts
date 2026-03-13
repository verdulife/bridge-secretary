import { verifyInitData } from "@/middleware/telegram";
import { getUserProfile, getSoul, updateUserProfile, updateSoul } from "@/services/db";
import { client } from "@/services/db";

export async function handlePanel(req: Request): Promise<Response> {
  const initData = req.headers.get("x-init-data") ?? "";
  const { valid, userId } = verifyInitData(initData);

  if (!valid || !userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  // GET /panel/profile
  if (path === "/api/panel/profile" && req.method === "GET") {
    const [soul, profile] = await Promise.all([
      getSoul(userId),
      getUserProfile(userId),
    ]);
    return Response.json({ soul, profile });
  }

  // POST /panel/profile
  if (path === "/api/panel/profile" && req.method === "POST") {
    const body = await req.json() as { soul?: Record<string, any>; profile?: Record<string, any> };
    if (body.soul) await updateSoul(userId, body.soul);
    if (body.profile) await updateUserProfile(userId, body.profile);
    return Response.json({ ok: true });
  }

  // GET /panel/integrations
  if (path === "/api/panel/integrations" && req.method === "GET") {
    const result = await client.execute({
      sql: "SELECT google_token FROM users WHERE id = ?",
      args: [userId],
    });

    const user = result.rows[0];
    return Response.json({
      gmail: !!user?.google_token,
      calendar: false,
      notion: false,
    });
  }

  // GET /panel/usage
  if (path === "/api/panel/usage" && req.method === "GET") {
    const result = await client.execute({
      sql: `SELECT 
              SUM(input_tokens) as total_input,
              SUM(output_tokens) as total_output,
              task,
              COUNT(*) as calls
            FROM usage 
            WHERE user_id = ?
            GROUP BY task`,
      args: [userId],
    });

    const by_task: Record<string, number> = {};
    let total_input = 0;
    let total_output = 0;

    for (const row of result.rows) {
      by_task[row.task as string] = row.calls as number;
      total_input += row.total_input as number;
      total_output += row.total_output as number;
    }

    return Response.json({ total_input, total_output, by_task });
  }

  // DELETE /panel/account
  if (path === "/api/panel/account" && req.method === "DELETE") {
    await client.execute({ sql: "DELETE FROM conversations WHERE user_id = ?", args: [userId] });
    await client.execute({ sql: "DELETE FROM usage WHERE user_id = ?", args: [userId] });
    await client.execute({ sql: "DELETE FROM users WHERE id = ?", args: [userId] });
    return Response.json({ ok: true });
  }

  return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
}


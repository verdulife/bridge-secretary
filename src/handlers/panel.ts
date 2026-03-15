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
              task,
              COUNT(*) as calls,
              SUM(input_tokens) as input_tokens,
              SUM(output_tokens) as output_tokens
            FROM usage
            WHERE user_id = ?
            GROUP BY task
            ORDER BY (SUM(input_tokens) + SUM(output_tokens)) DESC`,
      args: [userId],
    });

    let total_input = 0;
    let total_output = 0;
    const by_task: Record<string, { calls: number; input: number; output: number }> = {};

    for (const row of result.rows) {
      const input = row.input_tokens as number;
      const output = row.output_tokens as number;
      by_task[row.task as string] = {
        calls: row.calls as number,
        input,
        output,
      };
      total_input += input;
      total_output += output;
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


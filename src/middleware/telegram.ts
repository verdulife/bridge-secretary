import { createHmac } from "crypto";

export function verifyInitData(initData: string): { valid: boolean; userId?: number } {
  if (Bun.env.NODE_ENV === "development" && initData === "dev") {
    return { valid: true, userId: Number(Bun.env.ADMIN_ID) };
  }

  try {
    const token = Bun.env.TELEGRAM_TOKEN!;
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return { valid: false };

    params.delete("hash");

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
    const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    if (expectedHash !== hash) return { valid: false };

    const user = JSON.parse(params.get("user") ?? "{}");
    return { valid: true, userId: user.id };
  } catch {
    return { valid: false };
  }
}
import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  const isLoginPage = context.url.pathname === "/login";
  const session = context.cookies.get("session");

  if (isLoginPage) return next();

  if (!session || session.value !== import.meta.env.ADMIN_PASSWORD) {
    return context.redirect("/login");
  }

  return next();
});
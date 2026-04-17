import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env";

function getRequiredRole(pathname: string) {
  if (pathname.startsWith("/student")) return "student";
  if (pathname.startsWith("/institute")) return "institute";
  if (pathname.startsWith("/admin")) return "admin";
  return null;
}

export async function middleware(request: NextRequest) {
  const requiredRole = getRequiredRole(request.nextUrl.pathname);
  if (!requiredRole) return NextResponse.next();

  const env = getPublicEnv();
  if (!env.ok) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.data.NEXT_PUBLIC_SUPABASE_URL, env.data.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || profile.role !== requiredRole) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/student/:path*", "/institute/:path*", "/admin/:path*"],
};

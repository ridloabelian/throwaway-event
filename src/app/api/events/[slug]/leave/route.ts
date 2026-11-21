import { NextResponse } from "next/server";
import { getCookieName, isRequestSecure } from "@/lib/auth";

export async function POST(
  req: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(getCookieName(slug), "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isRequestSecure(req),
    maxAge: 0,
  });
  return res;
}

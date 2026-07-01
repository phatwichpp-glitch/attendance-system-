import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateLinkCode } from "@/lib/line-link-store";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const code = generateLinkCode(session.user.email);
  return NextResponse.json({ code });
}

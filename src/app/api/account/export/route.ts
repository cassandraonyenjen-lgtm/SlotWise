import { auth } from "@/auth";
import { getDb } from "@/db";
import { exportAccount } from "@/features/account/account";

export const dynamic = "force-dynamic";

/** Downloads everything Slotwise stores about the signed-in host, as JSON. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Not signed in" }, { status: 401 });
  const data = await exportAccount(getDb(), session.user.id);
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="slotwise-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

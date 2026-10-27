import "server-only";
import { auth } from "@/auth";

/** The signed-in user's id, for server actions. Pages are already gated by the dashboard layout. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

import { NotImplementedError } from "@/lib/not-implemented";

export async function findBookingByManageToken(token: string): Promise<never> {
  void token;
  throw new NotImplementedError("findBookingByManageToken (F5, Phase 4)");
}

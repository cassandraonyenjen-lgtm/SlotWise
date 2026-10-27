import { NotImplementedError } from "@/lib/not-implemented";
import type { Slot, SlotQuery } from "./types";

/** Computes bookable slots for one meeting type. Pure, so it can be tested exhaustively. */
export function computeSlots(query: SlotQuery): Slot[] {
  void query;
  throw new NotImplementedError("computeSlots (F1, Phase 1)");
}

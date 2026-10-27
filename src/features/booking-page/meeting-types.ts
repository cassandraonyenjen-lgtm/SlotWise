/** Host-side meeting type and username queries. Takes `db` so DB tests can call it directly. */
import { and, asc, count, eq, notInArray } from "drizzle-orm";
import type { Database } from "@/db";
import { bookings, customQuestions, meetingTypes, users } from "@/db/schema";
import { MAX_MEETING_TYPES, type MeetingTypeInput } from "./schemas";

const UNIQUE_VIOLATION = "23505";

export type MeetingTypeWithQuestions = typeof meetingTypes.$inferSelect & {
  questions: (typeof customQuestions.$inferSelect)[];
};

export type SaveResult =
  { ok: true; id: string } | { ok: false; error: string; field?: keyof MeetingTypeInput };

export async function listMeetingTypes(db: Database, userId: string) {
  return db.query.meetingTypes.findMany({
    where: eq(meetingTypes.userId, userId),
    orderBy: [asc(meetingTypes.createdAt)],
  });
}

export async function getMeetingType(
  db: Database,
  userId: string,
  id: string,
): Promise<MeetingTypeWithQuestions | undefined> {
  return db.query.meetingTypes.findFirst({
    where: and(eq(meetingTypes.id, id), eq(meetingTypes.userId, userId)),
    with: { questions: { orderBy: [asc(customQuestions.position)] } },
  });
}

export async function createMeetingType(
  db: Database,
  userId: string,
  input: MeetingTypeInput,
): Promise<SaveResult> {
  const [{ value: existing } = { value: 0 }] = await db
    .select({ value: count() })
    .from(meetingTypes)
    .where(eq(meetingTypes.userId, userId));
  if (existing >= MAX_MEETING_TYPES) {
    return { ok: false, error: `You can have up to ${MAX_MEETING_TYPES} meeting types` };
  }

  const { questions, ...fields } = input;
  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(meetingTypes)
        .values({ ...fields, userId })
        .returning();
      if (questions.length) {
        await tx.insert(customQuestions).values(
          questions.map((q, position) => ({
            meetingTypeId: row!.id,
            label: q.label,
            type: q.type,
            required: q.required,
            position,
          })),
        );
      }
      return row!.id;
    });
    return { ok: true, id };
  } catch (error) {
    if (isUniqueViolation(error, "meeting_types_user_slug_idx")) return slugTaken();
    throw error;
  }
}

/**
 * Updates fields and questions. Existing questions keep their ids (and past answers);
 * questions removed from the form are deleted along with their answers.
 */
export async function updateMeetingType(
  db: Database,
  userId: string,
  id: string,
  input: MeetingTypeInput,
): Promise<SaveResult> {
  const { questions, ...fields } = input;
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .update(meetingTypes)
        .set(fields)
        .where(and(eq(meetingTypes.id, id), eq(meetingTypes.userId, userId)))
        .returning({ id: meetingTypes.id });
      if (!row) return { ok: false as const, error: "Meeting type not found" };

      const keptIds = questions.flatMap((q) => (q.id ? [q.id] : []));
      await tx
        .delete(customQuestions)
        .where(
          keptIds.length
            ? and(eq(customQuestions.meetingTypeId, id), notInArray(customQuestions.id, keptIds))
            : eq(customQuestions.meetingTypeId, id),
        );
      for (const [position, q] of questions.entries()) {
        const values = { label: q.label, type: q.type, required: q.required, position };
        if (q.id) {
          await tx
            .update(customQuestions)
            .set(values)
            .where(and(eq(customQuestions.id, q.id), eq(customQuestions.meetingTypeId, id)));
        } else {
          await tx.insert(customQuestions).values({ ...values, meetingTypeId: id });
        }
      }
      return { ok: true as const, id };
    });
  } catch (error) {
    if (isUniqueViolation(error, "meeting_types_user_slug_idx")) return slugTaken();
    throw error;
  }
}

/** Meeting types with bookings can't be deleted (their history matters); disable them instead. */
export async function deleteMeetingType(
  db: Database,
  userId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [{ value: bookingCount } = { value: 0 }] = await db
    .select({ value: count() })
    .from(bookings)
    .where(eq(bookings.meetingTypeId, id));
  if (bookingCount > 0) {
    return {
      ok: false,
      error: "This meeting type has bookings, so it can't be deleted. Turn it off instead.",
    };
  }
  await db
    .delete(meetingTypes)
    .where(and(eq(meetingTypes.id, id), eq(meetingTypes.userId, userId)));
  return { ok: true };
}

export async function getUsername(db: Database, userId: string) {
  const user = await db.query.users.findFirst({
    columns: { username: true, name: true },
    where: eq(users.id, userId),
  });
  return user ?? null;
}

export async function setUsername(
  db: Database,
  userId: string,
  username: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db.update(users).set({ username }).where(eq(users.id, userId));
    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error, "users_username_unique")) {
      return { ok: false, error: "That link is already taken. Try another." };
    }
    throw error;
  }
}

function slugTaken() {
  return {
    ok: false as const,
    error: "You already have a meeting type with that link",
    field: "slug" as const,
  };
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    const { code, constraint_name } = e as { code?: string; constraint_name?: string };
    if (code === UNIQUE_VIOLATION && constraint_name === constraint) return true;
  }
  return false;
}

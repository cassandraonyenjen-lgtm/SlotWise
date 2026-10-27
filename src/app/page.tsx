import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = { searchParams: Promise<{ deleted?: string }> };

export default async function HomePage({ searchParams }: Props) {
  const { deleted } = await searchParams;
  return (
    <main className="mx-auto flex min-h-[85dvh] max-w-2xl flex-col justify-center gap-6 px-4 py-16">
      {deleted && (
        <p role="status" className="bg-muted rounded-md p-3 text-sm">
          Your account and its data have been deleted.
        </p>
      )}
      <p className="text-primary text-sm font-semibold">Slotwise</p>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Share one link. Set your hours once.
      </h1>
      <p className="text-muted-foreground text-lg">
        Let clients book you without the back-and-forth, in their own time zone.
      </p>
      <div>
        <Button asChild size="lg">
          <Link href="/sign-in">Get started</Link>
        </Button>
      </div>
    </main>
  );
}

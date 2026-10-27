import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-16">
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

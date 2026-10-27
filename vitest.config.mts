import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    env: { AUTH_SECRET: process.env.AUTH_SECRET ?? "test-only-secret" },
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["src/**/*.test.{ts,tsx}"], environment: "node" },
      },
      {
        // Needs a migrated Postgres at DATABASE_URL: `pnpm db:migrate && pnpm test:db`.
        extends: true,
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          environment: "node",
          setupFiles: ["dotenv/config"],
          testTimeout: 30_000,
        },
      },
    ],
  },
});

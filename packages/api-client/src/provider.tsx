"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { shouldRetryQuery } from "./errors";
import { createBrowserDatabase } from "@repo/database/browser";
export function ApiProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60000, retry: shouldRetryQuery },
          mutations: { retry: false },
        },
      }),
  );
  useEffect(() => {
    if (
      process.env.NEXT_PUBLIC_API_MOCKING === "enabled" ||
      !process.env.NEXT_PUBLIC_SUPABASE_URL
    )
      return;
    let userId: string | undefined;
    const { data } = createBrowserDatabase().auth.onAuthStateChange(
      (_event, session) => {
        const nextId = session?.user.id;
        if (nextId !== userId) {
          client.clear();
          userId = nextId;
        }
      },
    );
    return () => data.subscription.unsubscribe();
  }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

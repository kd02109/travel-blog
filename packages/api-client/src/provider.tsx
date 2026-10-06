"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { shouldRetryQuery } from "./errors";
import { createBrowserDatabase } from "@repo/database/browser";
import { createAuthCacheSync } from "./auth-cache";
import { ApiErrorProvider } from "./error-provider";
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
    const syncAuthCache = createAuthCacheSync(client);
    const { data } = createBrowserDatabase().auth.onAuthStateChange(
      (event, session) => syncAuthCache(event, session?.user.id),
    );
    return () => data.subscription.unsubscribe();
  }, [client]);
  return (
    <QueryClientProvider client={client}>
      <ApiErrorProvider>{children}</ApiErrorProvider>
    </QueryClientProvider>
  );
}

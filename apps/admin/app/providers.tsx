"use client";
import { ApiProvider } from "@repo/api-client/provider";
import { MockApiProvider } from "@repo/mock-api/react";
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MockApiProvider
      enabled={
        process.env.NODE_ENV === "development" &&
        process.env.NEXT_PUBLIC_API_MOCKING === "enabled"
      }
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL}
    >
      <ApiProvider>{children}</ApiProvider>
    </MockApiProvider>
  );
}

import type { QueryClient } from "@tanstack/react-query";

export function createAuthCacheSync(client: QueryClient) {
  let userId: string | undefined;
  let initialized = false;
  return (_event: string, nextId: string | undefined) => {
    // Supabase can emit SIGNED_IN before INITIAL_SESSION during startup.
    if (!initialized) {
      initialized = true;
      userId = nextId;
      return;
    }
    if (nextId === userId) return;
    userId = nextId;
    client.getMutationCache().clear();
    void client.resetQueries();
  };
}

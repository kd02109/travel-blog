const projectListUrl = "https://supabase.com/dashboard/projects";

export function authUsersDashboardUrl(supabaseUrl: string | undefined) {
  try {
    const host = new URL(supabaseUrl ?? "").hostname;
    const projectRef = /^([a-z0-9-]+)\.supabase\.co$/.exec(host)?.[1];
    return projectRef
      ? `https://supabase.com/dashboard/project/${projectRef}/auth/users`
      : projectListUrl;
  } catch {
    return projectListUrl;
  }
}

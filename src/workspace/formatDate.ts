// Shared date formatting for the workspace file views.
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

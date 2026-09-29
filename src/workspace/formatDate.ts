// Shared by FileGrid.tsx and FileList.tsx so the two views can't drift on
// date formatting (found in code review: previously duplicated verbatim).
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

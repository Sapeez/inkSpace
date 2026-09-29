// design req 3.3: no-files/no-folders empty states — a distinct message per
// variant rather than one generic "nothing here" for both.
interface EmptyStateProps {
  variant: 'files' | 'folders';
  testId: string;
}

const COPY: Record<EmptyStateProps['variant'], { title: string; message: string }> = {
  files: {
    title: 'No files yet',
    message: 'Upload a PDF to get started.',
  },
  folders: {
    title: 'No folders yet',
    message: 'Create a folder to organize your files.',
  },
};

export default function EmptyState({ variant, testId }: EmptyStateProps) {
  const copy = COPY[variant];
  return (
    <div className="workspace-empty-state" data-testid={testId}>
      <p className="workspace-empty-state-title">{copy.title}</p>
      <p className="workspace-empty-state-message">{copy.message}</p>
    </div>
  );
}

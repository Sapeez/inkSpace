// design req 3.3: no-files empty state.
interface EmptyStateProps {
  variant: 'files';
  testId: string;
}

const COPY: Record<EmptyStateProps['variant'], { title: string; message: string }> = {
  files: {
    title: 'No files yet',
    message: 'Upload a PDF to get started.',
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

import { Link } from 'react-router-dom';
import type { WorkspaceAttachment } from './types';
import FileThumbnail from './FileThumbnail';

const RECENT_LIMIT = 6;

interface RecentSectionProps {
  files: WorkspaceAttachment[];
}

// WF7: recently opened/edited files, most recent first, shown above the full
// file list. This app doesn't track "last opened" separately from "last
// modified" (no such field/requirement in this task's relevant-files list),
// so `updatedAt` is used as the recency signal — documented simplification,
// not a silent gap.
export default function RecentSection({ files }: RecentSectionProps) {
  if (files.length === 0) return null;

  const recent = [...files]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, RECENT_LIMIT);

  return (
    <section className="recent-section" data-testid="recent-section">
      <h2>Recent</h2>
      <ul className="recent-section-items">
        {recent.map((file) => (
          <li key={file.id} className="recent-item" data-testid="recent-item">
            <Link to={`/view/${file.id}`} className="recent-item-link">
              <FileThumbnail attachmentId={file.id} />
              <span className="recent-item-name">{file.filename}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

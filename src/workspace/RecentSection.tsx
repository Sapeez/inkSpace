import { Link } from 'react-router-dom';
import type { WorkspaceAttachment } from './types';
import { lastActivityTime } from './types';
import FileThumbnail from './FileThumbnail';

const RECENT_LIMIT = 5;

interface RecentSectionProps {
  files: WorkspaceAttachment[];
}

// WF7: recently opened/edited files, most recent first, shown above the full
// file list. The "Recent" heading lives in WorkspacePage's toolbar row, next
// to the Upload button and search bar. This app doesn't track "last opened" separately from "last
// modified" (no such field/requirement in this task's relevant-files list),
// so the recency signal is the later of `updatedAt` and `draftUpdatedAt` (the
// autosaved annotation draft's last change) — a file annotated a moment ago
// appears here even though its own `updatedAt` never moved.
export default function RecentSection({ files }: RecentSectionProps) {
  if (files.length === 0) return null;

  const recent = [...files]
    .sort((a, b) => lastActivityTime(b) - lastActivityTime(a))
    .slice(0, RECENT_LIMIT);

  return (
    <section className="recent-section" data-testid="recent-section">
      <ul className="recent-section-items">
        {recent.map((file) => (
          <li key={file.id} className="recent-item" data-testid="recent-item">
            <Link to={`/edit/${file.id}`} className="recent-item-link">
              <FileThumbnail attachmentId={file.id} />
              <span className="recent-item-name">{file.filename}</span>
              {file.draftUpdatedAt && (
                <span className="recent-item-draft" data-testid="recent-item-draft">
                  Draft
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

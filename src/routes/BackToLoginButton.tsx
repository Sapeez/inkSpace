import { Link } from 'react-router-dom';

// Outlined "Back to login" link: an arrow tile slides across on hover.
export default function BackToLoginButton({ testId }: { testId: string }) {
  return (
    <Link to="/login" className="back-button" data-testid={testId}>
      <span className="back-button-slider" aria-hidden="true">
        <svg viewBox="0 0 1024 1024" width="18" height="18" fill="currentColor">
          <path d="M224 480h640a32 32 0 1 1 0 64H224a32 32 0 0 1 0-64z" />
          <path d="m237.248 512 265.408 265.344a32 32 0 0 1-45.312 45.312l-288-288a32 32 0 0 1 0-45.312l288-288a32 32 0 1 1 45.312 45.312L237.248 512z" />
        </svg>
      </span>
      <span className="back-button-label">Back to login</span>
    </Link>
  );
}

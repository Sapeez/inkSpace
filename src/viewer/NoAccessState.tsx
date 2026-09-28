// P5: rendered by ViewerPage.jsx *instead of* the viewer chrome (Toolbar,
// PDFViewer, etc.) whenever the attachment fetch comes back 401/403/404 —
// never a blank screen or a raw error string inside the normal layout.
export default function NoAccessState() {
  return (
    <div className="no-access-state" data-testid="empty-state">
      <h1 className="no-access-state-title">Can&apos;t open this file</h1>
      <p className="no-access-state-message">
        Either this file doesn&apos;t exist, or you don&apos;t have permission to view it. Ask the owner
        for access, or check the link you used to get here.
      </p>
    </div>
  );
}

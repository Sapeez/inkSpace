export default function Toolbar({ attachmentId }) {
  return (
    <header className="toolbar" role="toolbar" aria-label="Annotation tools">
      <span>Attachment: {attachmentId}</span>
      {/* Tool buttons: pen, text, burn-in, save, download */}
    </header>
  );
}

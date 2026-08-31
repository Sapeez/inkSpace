import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <main>
      <h1>Brand You</h1>
      <p>Upload and annotate brand assets with permissioned access.</p>
      <Link to="/view/demo">Open viewer</Link>
    </main>
  );
}

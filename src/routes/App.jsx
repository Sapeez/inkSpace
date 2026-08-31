import { Routes, Route } from 'react-router-dom';
import HomePage from './HomePage.jsx';
import ViewerPage from '../viewer/ViewerPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/view/:attachmentId" element={<ViewerPage />} />
    </Routes>
  );
}

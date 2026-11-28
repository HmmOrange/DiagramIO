import type { ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import AccountPage from './pages/AccountPage';
import DiagramPage from './pages/DiagramPage';
import LoginPage from './pages/LoginPage';
import MyDiagramsPage from './pages/MyDiagramsPage';
import PublicDiagramsPage from './pages/PublicDiagramsPage';
import RegisterPage from './pages/RegisterPage';

function RequireLogin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p>Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="header">
      <Link to="/" className="brand">
        DiagramIO
      </Link>
      <nav>
        {user && <NavLink to="/" end>My diagrams</NavLink>}
        <NavLink to="/public">Public diagrams</NavLink>
        {user ? (
          <>
            <NavLink to="/account">{user.username}</NavLink>
            <button type="button" className="link-button" onClick={handleLogout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <NavLink to="/login">Log in</NavLink>
            <NavLink to="/register">Register</NavLink>
          </>
        )}
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/public" element={<PublicDiagramsPage />} />
          <Route path="/diagrams/:id" element={<DiagramPage />} />
          <Route path="/s/:token" element={<DiagramPage />} />
          <Route
            path="/"
            element={
              <RequireLogin>
                <MyDiagramsPage />
              </RequireLogin>
            }
          />
          <Route
            path="/account"
            element={
              <RequireLogin>
                <AccountPage />
              </RequireLogin>
            }
          />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </>
  );
}

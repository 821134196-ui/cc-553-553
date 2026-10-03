import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth, ROLE_LABEL, Role } from './auth';
import LoginPage from './pages/LoginPage';
import FarmerPage from './pages/FarmerPage';
import CollectorPage from './pages/CollectorPage';
import ReviewerPage from './pages/ReviewerPage';
import AdminPage from './pages/AdminPage';

const HOME: Record<Role, string> = {
  FARMER: '/farmer',
  COLLECTOR: '/collector',
  REVIEWER: '/reviewer',
  ADMIN: '/admin',
};

function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return <LoginPage />;

  const tabs: { to: string; label: string; roles: Role[] }[] = [
    { to: '/farmer', label: '我的收据', roles: ['FARMER'] },
    { to: '/collector', label: '过磅登记', roles: ['COLLECTOR', 'ADMIN'] },
    { to: '/reviewer', label: '资格审核', roles: ['REVIEWER', 'ADMIN'] },
    { to: '/admin', label: '地块统计 / 兑付', roles: ['ADMIN'] },
  ];
  const visible = tabs.filter((t) => t.roles.includes(user.role));

  return (
    <div className="layout">
      <div className="topbar">
        <span className="brand">🌱 农膜回收补贴系统</span>
        <div className="tabs">
          {visible.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) => (isActive ? 'active' : '')}
              style={{ textDecoration: 'none' }}
            >
              {({ isActive }) => <button className={isActive ? 'active' : ''}>{t.label}</button>}
            </NavLink>
          ))}
        </div>
        <span className="spacer" />
        <span className="who">
          {user.name}（{ROLE_LABEL[user.role]}）
        </span>
        <button
          onClick={() => {
            logout();
            navigate('/');
          }}
        >
          退出
        </button>
      </div>
      <Routes>
        <Route path="/farmer" element={user.role === 'FARMER' ? <FarmerPage /> : <Forbidden />} />
        <Route
          path="/collector"
          element={['COLLECTOR', 'ADMIN'].includes(user.role) ? <CollectorPage /> : <Forbidden />}
        />
        <Route
          path="/reviewer"
          element={['REVIEWER', 'ADMIN'].includes(user.role) ? <ReviewerPage /> : <Forbidden />}
        />
        <Route path="/admin" element={user.role === 'ADMIN' ? <AdminPage /> : <Forbidden />} />
        <Route path="*" element={<Navigate to={HOME[user.role]} replace />} />
      </Routes>
    </div>
  );
}

function Forbidden() {
  return (
    <div className="container">
      <div className="alert error">无权访问该页面。</div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/*" element={<Shell />} />
    </Routes>
  );
}

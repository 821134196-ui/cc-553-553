import { useState } from 'react';
import { authStore, type User } from './api';
import { ROLE_LABEL } from './components';
import { Login } from './Login';
import { CollectorPage } from './pages/CollectorPage';
import { ReviewerPage } from './pages/ReviewerPage';
import { AdminPage } from './pages/AdminPage';
import { FarmerPage } from './pages/FarmerPage';

export function App() {
  const [user, setUser] = useState<User | null>(() => authStore.user);

  if (!user) return <Login onLogin={setUser} />;

  const logout = () => {
    authStore.clear();
    setUser(null);
  };

  return (
    <div>
      <header className="topbar">
        <h1>🌱 废旧农膜回收称重与补贴资格系统</h1>
        <div className="who">
          <span>{user.name}（{ROLE_LABEL[user.role]}）</span>
          <button className="btn small secondary" onClick={logout}>退出登录</button>
        </div>
      </header>
      <main>
        {user.role === 'COLLECTOR' && <CollectorPage />}
        {user.role === 'REVIEWER' && <ReviewerPage currentUserName={user.name} />}
        {user.role === 'ADMIN' && <AdminPage />}
        {user.role === 'FARMER' && <FarmerPage userName={user.name} />}
      </main>
    </div>
  );
}

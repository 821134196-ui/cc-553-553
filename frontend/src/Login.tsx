import { useState } from 'react';
import { api, authStore } from './api';
import { ROLE_LABEL, type User } from './components';

const DEMO = [
  { username: 'admin', password: 'admin123' },
  { username: 'collector', password: 'collect123' },
  { username: 'reviewer', password: 'review123' },
  { username: 'zhang', password: 'zhang123' },
  { username: 'wang', password: 'wang123' },
];

export function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (u = username, p = password) => {
    setError('');
    setLoading(true);
    try {
      const res = await api<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: { username: u, password: p },
      });
      authStore.set(res.token, res.user);
      onLogin(res.user);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <form
        className="login-card"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1>🌱 废旧农膜回收称重与补贴系统</h1>
        <p className="sub">回收站登记 · 审核资格确认 · 补贴兑付 · 种植户查询</p>
        {error && <div className="alert error">{error}</div>}
        <label>
          用户名
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label>
          密码
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn" style={{ width: '100%' }} disabled={loading}>
          {loading ? '登录中…' : '登 录'}
        </button>
        <div className="demo">
          <div>演示账号（点击自动填入并登录）：</div>
          {DEMO.map((d) => (
            <button
              type="button"
              key={d.username}
              onClick={() => {
                setUsername(d.username);
                setPassword(d.password);
                void submit(d.username, d.password);
              }}
            >
              {ROLE_LABEL[roleOf(d.username)]} {d.username}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}

function roleOf(username: string): string {
  return { admin: 'ADMIN', collector: 'COLLECTOR', reviewer: 'REVIEWER', zhang: 'FARMER', wang: 'FARMER' }[username]!;
}

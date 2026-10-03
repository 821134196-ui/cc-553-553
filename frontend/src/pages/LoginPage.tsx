import { FormEvent, useState } from 'react';
import { useAuth } from '../auth';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const quick = (u: string) => {
    setUsername(u);
    setPassword('123456');
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>🌱 农膜回收称重与补贴</h1>
        <p className="sub">回收站登记 · 分拣审核 · 补贴兑付</p>
        {error && <div className="alert error">{error}</div>}
        <label className="field">
          <span>用户名</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="如 collector" autoFocus />
        </label>
        <label className="field">
          <span>密码</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="演示密码 123456" />
        </label>
        <button className="btn" style={{ width: '100%' }} disabled={loading}>
          {loading ? '登录中…' : '登 录'}
        </button>
        <div className="demo-accounts">
          演示账号（点击自动填充，密码均为 <code>123456</code>）：
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              ['zhang', '种植户 张老旱'],
              ['collector', '收料员 王收料'],
              ['reviewer', '审核员 李审核'],
              ['admin', '管理员'],
            ].map(([u, label]) => (
              <button type="button" key={u} className="btn secondary sm" onClick={() => quick(u)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}

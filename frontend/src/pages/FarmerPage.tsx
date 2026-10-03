import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, FILM_LABEL, kg, Progress, yuan } from '../components';

interface FarmerDashboard {
  plots: { id: number; code: string; name: string; areaMu: number }[];
  tickets: {
    id: number;
    ticketNo: string;
    periodCode: string;
    plotCode: string;
    filmType: string;
    grossWeight: number;
    tareWeight: number;
    netWeight: number | null;
    qualityGrade: string | null;
    dirtRate: number | null;
    status: string;
    rejectReason: string | null;
    eligibleWeight: number;
    paidWeight: number;
    capNote: string | null;
    createdAt: string;
  }[];
  payouts: {
    id: number;
    receiptNo: string;
    totalWeight: number;
    amount: number;
    createdAt: string;
    period: { code: string; name: string };
  }[];
  summary: {
    periodCode: string;
    periodName: string;
    submittedKg: number;
    eligibleKg: number;
    estimatedYuan: number;
    paidYuan: number;
    paidKg: number;
    pendingYuan: number;
  }[];
}

export function FarmerPage({ userName }: { userName: string }) {
  const [data, setData] = useState<FarmerDashboard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<FarmerDashboard>('/farmer/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert error">{error}</div>;
  if (!data) return <div className="card">加载中…</div>;

  const totalSubmitted = data.summary.reduce((s, x) => s + x.submittedKg, 0);
  const totalEligible = data.summary.reduce((s, x) => s + x.eligibleKg, 0);
  const totalPending = data.summary.reduce((s, x) => s + x.pendingYuan, 0);
  const totalPaid = data.summary.reduce((s, x) => s + x.paidYuan, 0);

  return (
    <div>
      <div className="card">
        <h2>👨‍🌾 {userName} 的农膜交售与补贴</h2>
        <div className="stat-grid">
          <div className="stat"><div className="label">累计交膜（净重）</div><div className="value">{kg(totalSubmitted)}</div></div>
          <div className="stat"><div className="label">审核合格量</div><div className="value">{kg(totalEligible)}</div></div>
          <div className="stat"><div className="label">预计补贴</div><div className="value">{yuan(totalPending + totalPaid)}</div></div>
          <div className="stat"><div className="label">已领取补贴</div><div className="value">{yuan(totalPaid)}</div></div>
          <div className="stat"><div className="label">待兑付</div><div className="value" style={{ color: 'var(--amber)' }}>{yuan(totalPending)}</div></div>
        </div>

        <table>
          <thead>
            <tr><th>期次</th><th>交膜净重</th><th>合格量</th><th>预计补贴</th><th>已兑付重量</th><th>已领金额</th><th>待兑付</th></tr>
          </thead>
          <tbody>
            {data.summary.map((s) => (
              <tr key={s.periodCode}>
                <td className="nowrap">{s.periodCode}<div className="note">{s.periodName}</div></td>
                <td>{kg(s.submittedKg)}</td>
                <td><strong>{kg(s.eligibleKg)}</strong></td>
                <td>{yuan(s.estimatedYuan)}</td>
                <td>{kg(s.paidKg)}</td>
                <td>{yuan(s.paidYuan)}</td>
                <td style={{ color: s.pendingYuan > 0 ? 'var(--amber)' : undefined }}>{yuan(s.pendingYuan)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="note">说明：只有审核通过的数量才进入补贴清单；合格量可能因地块面积上限或当期总额度被裁剪。</div>
      </div>

      <div className="card">
        <h2>我的收据与处理进度（{data.tickets.length}）</h2>
        <table>
          <thead>
            <tr>
              <th>单号</th><th>地块</th><th>膜种</th><th>交膜净重</th><th>等级</th>
              <th>进度</th><th>合格量</th><th>已兑付</th><th>说明</th>
            </tr>
          </thead>
          <tbody>
            {data.tickets.map((t) => (
              <tr key={t.id}>
                <td className="nowrap">{t.ticketNo}<div className="note">{new Date(t.createdAt).toLocaleDateString('zh-CN')}</div></td>
                <td>{t.plotCode}</td>
                <td>{FILM_LABEL[t.filmType]}</td>
                <td>{kg(t.netWeight ?? t.grossWeight - t.tareWeight)}</td>
                <td>{t.qualityGrade ? <Badge value={t.qualityGrade} prefix="grade-" /> : '—'}</td>
                <td><Progress status={t.status} /></td>
                <td><strong>{kg(t.eligibleWeight)}</strong></td>
                <td>{kg(t.paidWeight)}</td>
                <td style={{ maxWidth: 260 }}>
                  {t.status === 'REJECTED'
                    ? <span style={{ color: 'var(--red)', fontSize: 12 }}>未计入补贴：{t.rejectReason}</span>
                    : t.capNote
                      ? <span className="cap-note" style={{ display: 'block' }}>{t.capNote}</span>
                      : <span className="muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>🧾 兑付回执</h2>
        {data.payouts.length === 0 ? (
          <div className="muted">暂无兑付记录</div>
        ) : (
          <table>
            <thead><tr><th>回执编号</th><th>期次</th><th>兑付重量</th><th>金额</th><th>出具时间</th></tr></thead>
            <tbody>
              {data.payouts.map((p) => (
                <tr key={p.id}>
                  <td className="nowrap">{p.receiptNo}</td>
                  <td>{p.period.code}</td>
                  <td>{kg(p.totalWeight)}</td>
                  <td><strong style={{ color: 'var(--green-dark)' }}>{yuan(p.amount)}</strong></td>
                  <td>{new Date(p.createdAt).toLocaleString('zh-CN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

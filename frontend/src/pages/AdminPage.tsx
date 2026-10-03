import { useEffect, useState } from 'react';
import { api } from '../api';
import { kg, Modal, yuan } from '../components';
import type { MasterData, PlotSummaryRow, Payout, QuotaRow, Ticket } from '../types';

export function AdminPage() {
  const [summary, setSummary] = useState<PlotSummaryRow[]>([]);
  const [quota, setQuota] = useState<QuotaRow[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [master, setMaster] = useState<MasterData | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [receipt, setReceipt] = useState<{ payout: Payout; duplicated: boolean; mockReceipt: any } | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = () =>
    Promise.all([
      api<PlotSummaryRow[]>('/admin/plot-summary'),
      api<QuotaRow[]>('/admin/quota'),
      api<Payout[]>('/payouts'),
      api<MasterData>('/master-data'),
      api<Ticket[]>('/tickets'),
    ]).then(([s, q, p, m, t]) => {
      setSummary(s); setQuota(q); setPayouts(p); setMaster(m); setTickets(t);
    });

  useEffect(() => { void load(); }, []);

  // 每位种植户当期：已通过未兑付数量
  const payableByFarmer = new Map<number, { periodId: number; weight: number }>();
  for (const t of tickets) {
    const rest = t.eligibleWeight - t.paidWeight;
    if (t.status === 'APPROVED' && rest > 0.001) {
      const cur = payableByFarmer.get(t.farmerId) ?? { periodId: t.periodId, weight: 0 };
      cur.weight += rest;
      payableByFarmer.set(t.farmerId, cur);
    }
  }

  const createPayout = async (farmerId: number, periodId: number) => {
    setMsg(null);
    try {
      const res = await api<{ payout: Payout; duplicated: boolean; mockReceipt: any }>('/payouts', {
        method: 'POST',
        body: { periodId, farmerId },
      });
      setReceipt(res);
      await load();
    } catch (e: any) {
      setMsg({ kind: 'error', text: e.message });
    }
  };

  return (
    <div>
      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}

      <div className="card">
        <h2>📊 当期额度看板</h2>
        <table>
          <thead>
            <tr>
              <th>期次</th><th>单价</th><th>面积上限</th><th>总额度</th>
              <th>已确认合格量</th><th>已兑付</th><th>剩余额度</th><th>状态</th>
            </tr>
          </thead>
          <tbody>
            {quota.map((q) => (
              <tr key={q.periodId}>
                <td className="nowrap">{q.code}<div className="note">{q.name}</div></td>
                <td>{yuan(q.ratePerKg)}/kg</td>
                <td>{q.kgPerMu} kg/亩</td>
                <td>{kg(q.totalQuotaKg)}</td>
                <td><strong>{kg(q.approvedKg)}</strong></td>
                <td>{kg(q.paidKg)}</td>
                <td style={{ color: q.remainingKg <= 0.001 ? 'var(--red)' : undefined }}>
                  {kg(q.remainingKg)}
                </td>
                <td>
                  {q.quotaReached
                    ? <span className="badge REJECTED">额度已达上限</span>
                    : <span className="badge APPROVED">额度内</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>🌾 按地块回收量 / 合格量 / 已兑付量</h2>
        <table>
          <thead>
            <tr>
              <th>地块</th><th>种植户</th><th>面积</th><th>回收量</th>
              <th>合格量</th><th>已兑付量</th><th>待兑付</th><th>驳回单数</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((r) => (
              <tr key={r.plotId}>
                <td className="nowrap">{r.plotCode}<div className="note">{r.plotName}</div></td>
                <td>{r.farmer.name}</td>
                <td>{r.areaMu} 亩</td>
                <td>{kg(r.recoveredKg)}</td>
                <td><strong style={{ color: 'var(--green-dark)' }}>{kg(r.eligibleKg)}</strong></td>
                <td>{kg(r.paidKg)}</td>
                <td>{kg(r.pendingKg)}</td>
                <td>{r.rejectedCount > 0 ? <span style={{ color: 'var(--red)' }}>{r.rejectedCount}</span> : 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>💰 补贴兑付（本地模拟回执）</h2>
        <div className="note" style={{ marginBottom: 10 }}>
          同一期次同一种植户只有一张回执；重复点击不会重复出单、不会增加补贴金额。
        </div>
        <table>
          <thead>
            <tr>
              <th>种植户</th><th>期次</th><th>待兑付合格量</th><th>操作</th><th>历史回执</th>
            </tr>
          </thead>
          <tbody>
            {master?.farmers.map((f) => {
              const payable = payableByFarmer.get(f.id);
              const mine = payouts.filter((p) => p.farmerId === f.id);
              return (
                <tr key={f.id}>
                  <td>{f.name}（{f.username}）</td>
                  <td>{master.periods.find((p) => p.id === (payable?.periodId ?? master.periods[0]?.id))?.code ?? '—'}</td>
                  <td>{payable ? `${kg(payable.weight)}（预计 ${yuan(payable.weight * (quota.find((q) => q.periodId === payable.periodId)?.ratePerKg ?? 0))}）` : <span className="muted">无待兑付</span>}</td>
                  <td>
                    <button className="btn small" disabled={!payable} onClick={() => payable && createPayout(f.id, payable.periodId)}>
                      生成兑付回执
                    </button>
                  </td>
                  <td>
                    {mine.map((p) => (
                      <div key={p.id} className="nowrap">
                        <button className="btn small secondary" onClick={() => setReceipt({
                          payout: p,
                          duplicated: true,
                          mockReceipt: {
                            channel: '本地模拟兑付（财政惠农一卡通）',
                            status: 'SUCCESS',
                            receiptNo: p.receiptNo,
                            payee: p.farmer.name,
                            totalWeightKg: p.totalWeight,
                            amountYuan: p.amount,
                            paidAt: p.createdAt,
                            remark: '本回执由本地模拟器生成，不代表真实资金划转',
                          },
                        })}>
                          {p.receiptNo}（{yuan(p.amount)}）
                        </button>
                      </div>
                    ))}
                    {mine.length === 0 && <span className="muted">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {receipt && (
        <Modal title="🧾 兑付回执（本地模拟）" onClose={() => setReceipt(null)}>
          {receipt.duplicated && (
            <div className="alert info">该回执已存在，本次为重复提交，直接返回原回执——补贴金额不重复增加。</div>
          )}
          <table>
            <tbody>
              <tr><th>回执编号</th><td>{receipt.mockReceipt.receiptNo}</td></tr>
              <tr><th>兑付渠道</th><td>{receipt.mockReceipt.channel}</td></tr>
              <tr><th>收款人</th><td>{receipt.mockReceipt.payee}</td></tr>
              <tr><th>兑付重量</th><td>{kg(receipt.mockReceipt.totalWeightKg)}</td></tr>
              <tr><th>兑付金额</th><td><strong style={{ fontSize: 18, color: 'var(--green-dark)' }}>{yuan(receipt.mockReceipt.amountYuan)}</strong></td></tr>
              <tr><th>兑付时间</th><td>{new Date(receipt.mockReceipt.paidAt).toLocaleString('zh-CN')}</td></tr>
              <tr><th>状态</th><td><span className="badge APPROVED">{receipt.mockReceipt.status}</span></td></tr>
            </tbody>
          </table>
          <div className="note" style={{ marginTop: 10 }}>{receipt.mockReceipt.remark}</div>
          <div className="actions"><button className="btn" onClick={() => setReceipt(null)}>关闭</button></div>
        </Modal>
      )}
    </div>
  );
}

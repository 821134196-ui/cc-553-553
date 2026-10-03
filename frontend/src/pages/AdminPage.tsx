import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Card, Modal, ProgressLine, REJECT_LABEL } from '../components';

interface PlotStat {
  plotId: number;
  plotCode: string;
  plotName: string;
  areaMu: number;
  farmer: { id: number; name: string; username: string };
  ticketCount: number;
  recycledKg: number;
  qualifiedKg: number;
  qualifiedYuan: number;
  paidKg: number;
  paidYuan: number;
  paidCount: number;
  plotCapKg: number;
}
interface PeriodStat {
  id: number;
  code: string;
  name: string;
  totalQuotaYuan: number;
  usedQuotaYuan: number;
  remainingQuotaYuan: number;
  perMuCapKg: number;
  pricePerKg: number;
}
interface RecordRow {
  id: number;
  ticketNo: string;
  filmType: string;
  netWeightKg: number;
  sortedNetWeightKg: number | null;
  grade: string | null;
  status: string;
  rejectReason: string | null;
  suspectedDuplicate: boolean;
  approvedSubsidyKg: number;
  subsidyYuan: number;
  isPaid: boolean;
  plot: { code: string; name: string };
  farmer: { name: string };
  payment: { receiptNo: string; amountYuan: number; paidAt: string } | null;
}
interface PaymentRow {
  id: number;
  receiptNo: string;
  amountKg: number;
  amountYuan: number;
  paidAt: string;
  record: { id: number; ticketNo: string; filmType: string };
  farmer: { id: number; name: string };
  operator: { name: string };
}

export default function AdminPage() {
  const [stats, setStats] = useState<{ period: PeriodStat | null; plots: PlotStat[] }>({ period: null, plots: [] });
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [payTarget, setPayTarget] = useState<RecordRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, r, p] = await Promise.all([
      api<{ period: PeriodStat | null; plots: PlotStat[] }>('/stats/by-plot'),
      api<RecordRow[]>('/records'),
      api<PaymentRow[]>('/payments'),
    ]);
    setStats(s);
    setRecords(r);
    setPayments(p);
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  const pay = async () => {
    if (!payTarget) return;
    setBusy(true);
    try {
      const res = await api<{ payment: PaymentRow; idempotentReplay?: boolean }>(
        `/payments/records/${payTarget.id}/pay`,
        {
          method: 'POST',
          // 幂等键：同一单据的兑付按钮无论点几次都只产生一张回执
          body: JSON.stringify({ idempotencyKey: `web-pay-${payTarget.id}` }),
        },
      );
      setMsg(
        res.idempotentReplay
          ? `该单据已兑付，返回原回执 ${res.payment.receiptNo}（金额不重复）`
          : `兑付成功：回执 ${res.payment.receiptNo}，¥${res.payment.amountYuan.toFixed(2)}`,
      );
      setPayTarget(null);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const approvedUnpaid = records.filter((r) => r.status === 'APPROVED' && !r.isPaid && r.subsidyYuan > 0);
  const quotaPct = stats.period
    ? Math.min(100, (stats.period.usedQuotaYuan / stats.period.totalQuotaYuan) * 100)
    : 0;

  return (
    <div className="container">
      {msg && <div className="alert ok">{msg}</div>}
      {err && <div className="alert error">{err}</div>}

      {stats.period && (
        <Card title={`当期：${stats.period.name}（${stats.period.code}）`}>
          <div className="grid grid-4">
            <div className="stat">
              <div className="label">总额度</div>
              <div className="value">
                ¥{stats.period.totalQuotaYuan.toFixed(2)}
              </div>
            </div>
            <div className="stat">
              <div className="label">已核定占用</div>
              <div className="value" style={{ color: quotaPct >= 100 ? 'var(--danger)' : undefined }}>
                ¥{stats.period.usedQuotaYuan.toFixed(2)}
              </div>
            </div>
            <div className="stat">
              <div className="label">剩余额度</div>
              <div className="value">¥{stats.period.remainingQuotaYuan.toFixed(2)}</div>
            </div>
            <div className="stat">
              <div className="label">补贴单价 / 每亩上限</div>
              <div className="value" style={{ fontSize: 20 }}>
                ¥{stats.period.pricePerKg}/kg<span className="unit"> · {stats.period.perMuCapKg}kg/亩</span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14, height: 12, background: '#e9ede7', borderRadius: 6, overflow: 'hidden' }}>
            <div
              style={{
                width: `${quotaPct}%`,
                height: '100%',
                background: quotaPct >= 100 ? 'var(--danger)' : 'var(--green-600)',
                transition: 'width .4s',
              }}
            />
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            额度占用 {quotaPct.toFixed(1)}%{quotaPct >= 100 && '（已用尽，新审核单据补贴为 0）'}
          </div>
        </Card>
      )}

      <div style={{ height: 16 }} />

      <Card title="按地块回收量 / 合格量 / 已兑付量">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>地块</th>
                <th>种植户</th>
                <th>面积(亩)</th>
                <th>单据数</th>
                <th>回收量(kg)</th>
                <th>面积上限(kg)</th>
                <th>合格量(kg)</th>
                <th>核定补贴(元)</th>
                <th>已兑付(kg)</th>
                <th>已兑付(元)</th>
              </tr>
            </thead>
            <tbody>
              {stats.plots.map((p) => (
                <tr key={p.plotId}>
                  <td>
                    {p.plotCode}
                    <div className="muted">{p.plotName}</div>
                  </td>
                  <td>{p.farmer.name}</td>
                  <td>{p.areaMu}</td>
                  <td>{p.ticketCount}</td>
                  <td>{p.recycledKg.toFixed(1)}</td>
                  <td>{p.plotCapKg.toFixed(1)}</td>
                  <td>
                    <b>{p.qualifiedKg.toFixed(1)}</b>
                  </td>
                  <td>¥{p.qualifiedYuan.toFixed(2)}</td>
                  <td>{p.paidKg.toFixed(1)}</td>
                  <td style={{ color: 'var(--green-700)', fontWeight: 600 }}>¥{p.paidYuan.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ height: 16 }} />

      <Card title={`待兑付清单（${approvedUnpaid.length} 张已审核未兑付）`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>票据号</th>
                <th>种植户/地块</th>
                <th>膜种</th>
                <th>合格量</th>
                <th>金额</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {approvedUnpaid.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.ticketNo}</td>
                  <td>
                    {r.farmer.name}
                    <div className="muted">
                      {r.plot.code} {r.plot.name}
                    </div>
                  </td>
                  <td>{r.filmType}</td>
                  <td>{r.approvedSubsidyKg.toFixed(1)} kg</td>
                  <td>
                    <b>¥{r.subsidyYuan.toFixed(2)}</b>
                  </td>
                  <td>
                    <button className="btn sm" onClick={() => setPayTarget(r)}>
                      发起兑付
                    </button>
                  </td>
                </tr>
              ))}
              {approvedUnpaid.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                    暂无待兑付单据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ height: 16 }} />

      <Card title={`兑付回执（${payments.length} 条，本地模拟回执）`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>回执号</th>
                <th>种植户</th>
                <th>票据号</th>
                <th>膜种</th>
                <th>数量</th>
                <th>金额</th>
                <th>操作人</th>
                <th>兑付时间</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.receiptNo}</td>
                  <td>{p.farmer.name}</td>
                  <td className="mono">{p.record.ticketNo}</td>
                  <td>{p.record.filmType}</td>
                  <td>{p.amountKg.toFixed(1)} kg</td>
                  <td>
                    <b>¥{p.amountYuan.toFixed(2)}</b>
                  </td>
                  <td>{p.operator.name}</td>
                  <td>{new Date(p.paidAt).toLocaleString('zh-CN')}</td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                    暂无兑付记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ height: 16 }} />

      <Card title="全部单据流水">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>票据号</th>
                <th>种植户/地块</th>
                <th>净重/分拣</th>
                <th>状态</th>
                <th>核定</th>
                <th>兑付回执</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.ticketNo}</td>
                  <td>
                    {r.farmer.name} · {r.plot.code}
                  </td>
                  <td>
                    {r.netWeightKg} / {r.sortedNetWeightKg ?? '—'} kg
                    {r.grade && <span className={`badge grade-${r.grade}`} style={{ marginLeft: 4 }}>{r.grade}</span>}
                  </td>
                  <td>
                    <Badge status={r.status} />
                    {r.suspectedDuplicate && <span className="badge dup">重复</span>}
                    <ProgressLine status={r.status} />
                    {r.status === 'REJECTED' && (
                      <div className="muted" style={{ color: 'var(--danger)' }}>
                        {REJECT_LABEL[r.rejectReason ?? 'OTHER']}
                      </div>
                    )}
                  </td>
                  <td>
                    {r.status === 'APPROVED' ? (
                      <>
                        {r.approvedSubsidyKg}kg / ¥{r.subsidyYuan.toFixed(2)}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {r.payment ? (
                      <>
                        <span className="mono">{r.payment.receiptNo}</span>
                        <div className="muted">¥{r.payment.amountYuan.toFixed(2)}</div>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {payTarget && (
        <Modal title={`兑付确认 — ${payTarget.ticketNo}`} onClose={() => setPayTarget(null)}>
          <div className="detail-list">
            <div>
              <b>种植户：</b>
              {payTarget.farmer.name}
            </div>
            <div>
              <b>地块：</b>
              {payTarget.plot.code} {payTarget.plot.name}
            </div>
            <div>
              <b>核定补贴量：</b>
              {payTarget.approvedSubsidyKg} kg
            </div>
            <div>
              <b>应付金额：</b>
              <span style={{ fontSize: 18, color: 'var(--green-700)', fontWeight: 700 }}>
                ¥{payTarget.subsidyYuan.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="alert info" style={{ marginTop: 12 }}>
            将通过本地模拟渠道开具兑付回执；重复点击不会重复出款（一票一回执，幂等）。
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={busy} onClick={pay}>
              确认兑付
            </button>
            <button className="btn secondary" onClick={() => setPayTarget(null)}>
              取消
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

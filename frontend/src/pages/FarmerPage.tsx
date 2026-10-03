import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Card, GRADE_LABEL, Modal, ProgressLine, REJECT_LABEL } from '../components';

interface RecordRow {
  id: number;
  ticketNo: string;
  filmType: string;
  grossWeightKg: number;
  tareWeightKg: number;
  netWeightKg: number;
  sortedNetWeightKg: number | null;
  grade: string | null;
  status: string;
  rejectReason: string | null;
  approvedSubsidyKg: number;
  subsidyYuan: number;
  isPaid: boolean;
  suspectedDuplicate: boolean;
  createdAt: string;
  reviewedAt: string | null;
  plot: { code: string; name: string };
  payment: { receiptNo: string; amountYuan: number; paidAt: string } | null;
  corrections: {
    id: number;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    reason: string;
    createdAt: string;
    reviewer: { name: string };
  }[];
}

export default function FarmerPage() {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [detail, setDetail] = useState<RecordRow | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setRecords(await api('/records'));
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totals = records.reduce(
    (acc, r) => {
      if (r.status !== 'REJECTED') acc.recycled += r.netWeightKg;
      if (r.status === 'APPROVED') {
        acc.qualified += r.approvedSubsidyKg;
        acc.amount += r.subsidyYuan;
      }
      if (r.isPaid) acc.paid += r.subsidyYuan;
      return acc;
    },
    { recycled: 0, qualified: 0, amount: 0, paid: 0 },
  );

  return (
    <div className="container">
      {error && <div className="alert error">{error}</div>}
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Card>
          <div className="stat">
            <div className="label">累计回收净重</div>
            <div className="value">
              {totals.recycled.toFixed(1)} <span className="unit">kg</span>
            </div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">审核合格补贴量</div>
            <div className="value">
              {totals.qualified.toFixed(1)} <span className="unit">kg</span>
            </div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">核定补贴金额</div>
            <div className="value">
              ¥{totals.amount.toFixed(2)}
            </div>
          </div>
        </Card>
        <Card>
          <div className="stat">
            <div className="label">已兑付金额</div>
            <div className="value">
              ¥{totals.paid.toFixed(2)}
            </div>
          </div>
        </Card>
      </div>

      <Card title={`我的交膜收据（${records.length} 张）`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>收据号</th>
                <th>地块</th>
                <th>膜种</th>
                <th>过磅净重</th>
                <th>分拣净重/等级</th>
                <th>处理进度</th>
                <th>核定补贴</th>
                <th>兑付</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.ticketNo}</td>
                  <td>
                    {r.plot.code}
                    <div className="muted">{r.plot.name}</div>
                  </td>
                  <td>{r.filmType}</td>
                  <td>{r.netWeightKg.toFixed(1)} kg</td>
                  <td>
                    {r.sortedNetWeightKg != null ? (
                      <>
                        {r.sortedNetWeightKg.toFixed(1)} kg
                        <div>
                          <span className={`badge grade-${r.grade}`}>{GRADE_LABEL[r.grade ?? ''] ?? r.grade}</span>
                        </div>
                      </>
                    ) : (
                      <span className="muted">待分拣</span>
                    )}
                  </td>
                  <td style={{ minWidth: 160 }}>
                    <Badge status={r.status} />
                    {r.suspectedDuplicate && <span className="badge dup">重复嫌疑</span>}
                    <ProgressLine status={r.status} />
                    {r.status === 'REJECTED' && (
                      <div className="muted" style={{ color: 'var(--danger)' }}>
                        原因：{REJECT_LABEL[r.rejectReason ?? 'OTHER']}
                      </div>
                    )}
                  </td>
                  <td>
                    {r.status === 'APPROVED' ? (
                      <>
                        <b>{r.approvedSubsidyKg.toFixed(1)} kg</b>
                        <div className="muted">¥{r.subsidyYuan.toFixed(2)}</div>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {r.isPaid && r.payment ? (
                      <span className="badge paid">已兑付</span>
                    ) : r.status === 'APPROVED' ? (
                      <span className="badge unpaid">待兑付</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <button className="btn secondary sm" onClick={() => setDetail(r)}>
                      详情
                    </button>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 28 }}>
                    暂无交膜记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {detail && (
        <Modal title={`收据 ${detail.ticketNo}`} onClose={() => setDetail(null)}>
          <div className="detail-list">
            <div>
              <b>地块：</b>
              {detail.plot.code} {detail.plot.name}
            </div>
            <div>
              <b>膜种类：</b>
              {detail.filmType}
            </div>
            <div>
              <b>毛重 / 皮重：</b>
              {detail.grossWeightKg} kg / {detail.tareWeightKg} kg
            </div>
            <div>
              <b>过磅净重：</b>
              {detail.netWeightKg} kg
            </div>
            <div>
              <b>分拣净重：</b>
              {detail.sortedNetWeightKg ?? '—'} kg　<b>等级：</b>
              {detail.grade ?? '—'}
            </div>
            <div>
              <b>状态：</b>
              <Badge status={detail.status} />
              {detail.rejectReason && `（${REJECT_LABEL[detail.rejectReason]}）`}
            </div>
            <div>
              <b>核定补贴：</b>
              {detail.approvedSubsidyKg} kg / ¥{detail.subsidyYuan.toFixed(2)}
            </div>
            {detail.payment && (
              <div>
                <b>兑付回执：</b>
                <span className="mono">{detail.payment.receiptNo}</span>（¥
                {detail.payment.amountYuan.toFixed(2)}，{new Date(detail.payment.paidAt).toLocaleString('zh-CN')}）
              </div>
            )}
          </div>

          <h3>称重修正记录（{detail.corrections.length} 条）</h3>
          {detail.corrections.length === 0 && <div className="muted">无修正</div>}
          {detail.corrections.map((c) => (
            <div key={c.id} className="correction-item">
              <b>{c.field}</b>：{c.oldValue ?? '空'} → {c.newValue}
              <br />
              原因：{c.reason}
              <br />
              <span className="muted">
                复核人：{c.reviewer.name}　{new Date(c.createdAt).toLocaleString('zh-CN')}
              </span>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}

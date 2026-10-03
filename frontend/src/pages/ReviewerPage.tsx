import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Card, GRADE_LABEL, Modal, ProgressLine, REJECT_LABEL } from '../components';

interface Correction {
  id: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string;
  createdAt: string;
  reviewer: { name: string };
}
interface RecordRow {
  id: number;
  ticketNo: string;
  filmType: string;
  grossWeightKg: number;
  tareWeightKg: number;
  netWeightKg: number;
  sortedNetWeightKg: number | null;
  grade: string | null;
  qualityNote: string | null;
  status: string;
  rejectReason: string | null;
  suspectedDuplicate: boolean;
  duplicateOfId: number | null;
  approvedSubsidyKg: number;
  subsidyYuan: number;
  cappedByPlot: boolean;
  cappedByPeriod: boolean;
  isPaid: boolean;
  createdAt: string;
  plot: { id: number; code: string; name: string; areaMu: number };
  farmer: { name: string };
  collector: { id: number; name: string };
  reviewedBy: { name: string } | null;
  corrections: Correction[];
}

const FIELD_LABEL: Record<string, string> = {
  GROSS_WEIGHT: '毛重(kg)',
  TARE_WEIGHT: '皮重(kg)',
  SORTED_NET_WEIGHT: '分拣净重(kg)',
  GRADE: '质量等级',
};

export default function ReviewerPage() {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('SORTED');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [correctTarget, setCorrectTarget] = useState<RecordRow | null>(null);
  const [corrField, setCorrField] = useState('GROSS_WEIGHT');
  const [corrValue, setCorrValue] = useState('');
  const [corrReason, setCorrReason] = useState('');
  const [reviewTarget, setReviewTarget] = useState<RecordRow | null>(null);
  const [rejectReason, setRejectReason] = useState('SOIL_CONTAMINATION');
  const [reviewNote, setReviewNote] = useState('');
  const [clearDupTarget, setClearDupTarget] = useState<RecordRow | null>(null);
  const [clearDupNote, setClearDupNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRecords(await api<RecordRow[]>(`/records${statusFilter ? `?status=${statusFilter}` : ''}`));
  }, [statusFilter]);

  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  const flash = (ok: string) => {
    setMsg(ok);
    setErr('');
  };

  const submitCorrection = async () => {
    if (!correctTarget) return;
    setBusy(true);
    try {
      await api(`/records/${correctTarget.id}/corrections`, {
        method: 'POST',
        body: JSON.stringify({ field: corrField, newValue: corrValue, reason: corrReason }),
      });
      flash('称重修正已留痕（原值/原因/复核人已保存）');
      setCorrectTarget(null);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const review = async (decision: 'APPROVE' | 'REJECT') => {
    if (!reviewTarget) return;
    setBusy(true);
    try {
      const res = await api<{ calc?: any; idempotentReplay?: boolean; record: RecordRow }>(
        `/records/${reviewTarget.id}/review`,
        {
          method: 'POST',
          body: JSON.stringify({
            decision,
            rejectReason: decision === 'REJECT' ? rejectReason : undefined,
            reviewNote: reviewNote || undefined,
          }),
        },
      );
      if (decision === 'APPROVE') {
        const c = res.calc;
        if (c) {
          let text = `审核通过：核定 ${c.finalKg} kg / ¥${c.finalYuan}`;
          if (c.cappedByPlot) text += `（地块面积上限 ${c.plotCapKg}kg，已截断）`;
          if (c.cappedByPeriod) text += '（当期额度不足，已截断）';
          flash(text);
        } else flash('该单据已审核（幂等返回原结果）');
      } else {
        flash('已驳回，该单据不计入补贴');
      }
      setReviewTarget(null);
      setReviewNote('');
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const clearDup = async () => {
    if (!clearDupTarget) return;
    setBusy(true);
    try {
      await api(`/records/${clearDupTarget.id}/clear-duplicate`, {
        method: 'POST',
        body: JSON.stringify({ note: clearDupNote }),
      });
      flash('重复嫌疑已解除，可正常审核');
      setClearDupTarget(null);
      setClearDupNote('');
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      {msg && <div className="alert ok">{msg}</div>}
      {err && <div className="alert error">{err}</div>}

      <Card
        title="补贴资格审核"
        extra={
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="SORTED">待审核</option>
            <option value="">全部</option>
            <option value="PENDING">待分拣</option>
            <option value="APPROVED">审核通过</option>
            <option value="REJECTED">已驳回</option>
          </select>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>票据号</th>
                <th>种植户/地块</th>
                <th>膜种</th>
                <th>过磅净重</th>
                <th>分拣/等级</th>
                <th>收料员</th>
                <th>标记</th>
                <th>状态/核定</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.ticketNo}</td>
                  <td>
                    {r.farmer.name}
                    <div className="muted">
                      {r.plot.code} {r.plot.name}（{r.plot.areaMu}亩）
                    </div>
                  </td>
                  <td>{r.filmType}</td>
                  <td>{r.netWeightKg} kg</td>
                  <td>
                    {r.sortedNetWeightKg ?? '—'} kg
                    {r.grade && <span className={`badge grade-${r.grade}`} style={{ marginLeft: 4 }}>{GRADE_LABEL[r.grade].split('（')[0]}</span>}
                    {r.qualityNote && <div className="muted">{r.qualityNote}</div>}
                  </td>
                  <td>{r.collector.name}</td>
                  <td>
                    {r.suspectedDuplicate && <span className="badge dup">疑似重复过磅</span>}
                    {r.corrections.length > 0 && (
                      <div className="muted" style={{ color: 'var(--warn)' }}>
                        已修正 {r.corrections.length} 次
                      </div>
                    )}
                  </td>
                  <td style={{ minWidth: 150 }}>
                    <Badge status={r.status} />
                    <ProgressLine status={r.status} />
                    {r.status === 'APPROVED' && (
                      <div>
                        <b>{r.approvedSubsidyKg}kg</b> / ¥{r.subsidyYuan.toFixed(2)}
                        {(r.cappedByPlot || r.cappedByPeriod) && (
                          <div className="muted" style={{ color: 'var(--warn)' }}>
                            {r.cappedByPlot && '地块截断 '}
                            {r.cappedByPeriod && '额度截断'}
                          </div>
                        )}
                        {r.isPaid && <span className="badge paid">已兑付</span>}
                      </div>
                    )}
                    {r.status === 'REJECTED' && (
                      <div className="muted" style={{ color: 'var(--danger)' }}>
                        {REJECT_LABEL[r.rejectReason ?? 'OTHER']}
                      </div>
                    )}
                    {r.reviewedBy && <div className="muted">审核：{r.reviewedBy.name}</div>}
                  </td>
                  <td>
                    <div className="row-actions">
                      {r.status === 'SORTED' && (
                        <>
                          <button className="btn sm" onClick={() => setReviewTarget(r)}>
                            审核
                          </button>
                          <button
                            className="btn secondary sm"
                            onClick={() => {
                              setCorrectTarget(r);
                              setCorrField('GROSS_WEIGHT');
                              setCorrValue(String(r.grossWeightKg));
                              setCorrReason('');
                            }}
                          >
                            称重修正
                          </button>
                          {r.suspectedDuplicate && (
                            <button className="btn secondary sm" onClick={() => setClearDupTarget(r)}>
                              解除重复
                            </button>
                          )}
                        </>
                      )}
                      {r.status !== 'SORTED' && <span className="muted">已结案</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 28 }}>
                    没有待审核单据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 称重修正弹窗 */}
      {correctTarget && (
        <Modal title={`称重修正 — ${correctTarget.ticketNo}`} onClose={() => setCorrectTarget(null)}>
          <div className="alert info">
            修正将保留原值、新值、原因与复核人；不能修正本人登记的单据。
          </div>
          {correctTarget.corrections.length > 0 && (
            <>
              <h3>历史修正</h3>
              {correctTarget.corrections.map((c) => (
                <div key={c.id} className="correction-item">
                  {FIELD_LABEL[c.field]}：{c.oldValue ?? '空'} → {c.newValue}｜{c.reason}
                  <br />
                  <span className="muted">
                    复核人 {c.reviewer.name} · {new Date(c.createdAt).toLocaleString('zh-CN')}
                  </span>
                </div>
              ))}
            </>
          )}
          <label className="field" style={{ marginTop: 12 }}>
            <span>修正字段</span>
            <select
              value={corrField}
              onChange={(e) => {
                setCorrField(e.target.value);
                const r: any = correctTarget;
                setCorrValue(
                  e.target.value === 'GROSS_WEIGHT'
                    ? String(r.grossWeightKg)
                    : e.target.value === 'TARE_WEIGHT'
                      ? String(r.tareWeightKg)
                      : e.target.value === 'SORTED_NET_WEIGHT'
                        ? String(r.sortedNetWeightKg ?? '')
                        : String(r.grade ?? 'A'),
                );
              }}
            >
              {Object.entries(FIELD_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>新值{corrField === 'GRADE' ? '（A/B/C/REJECT）' : ''}</span>
            <input value={corrValue} onChange={(e) => setCorrValue(e.target.value)} />
          </label>
          <label className="field">
            <span>修正原因（必填）</span>
            <textarea value={corrReason} onChange={(e) => setCorrReason(e.target.value)} placeholder="如：第三方地磅复称，原读数偏高" />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={busy || !corrReason.trim()} onClick={submitCorrection}>
              提交修正
            </button>
            <button className="btn secondary" onClick={() => setCorrectTarget(null)}>
              取消
            </button>
          </div>
        </Modal>
      )}

      {/* 审核弹窗 */}
      {reviewTarget && (
        <Modal title={`补贴资格审核 — ${reviewTarget.ticketNo}`} onClose={() => setReviewTarget(null)}>
          <div className="detail-list">
            <div>
              <b>种植户/地块：</b>
              {reviewTarget.farmer.name} / {reviewTarget.plot.code}（{reviewTarget.plot.areaMu}亩，面积上限{' '}
              {(reviewTarget.plot.areaMu * 20).toFixed(0)} kg）
            </div>
            <div>
              <b>分拣净重/等级：</b>
              {reviewTarget.sortedNetWeightKg} kg / {reviewTarget.grade}（{GRADE_LABEL[reviewTarget.grade ?? 'A']}）
            </div>
            <div>
              <b>收料员：</b>
              {reviewTarget.collector.name}
            </div>
          </div>
          {reviewTarget.suspectedDuplicate && (
            <div className="alert error">
              ⚠️ 该单据疑似同一批膜重复过磅，不得直接计入补贴。请驳回，或核实后先「解除重复」。
            </div>
          )}
          {reviewTarget.grade && !['A', 'B'].includes(reviewTarget.grade) && (
            <div className="alert error">⚠️ 质量等级 {reviewTarget.grade}：泥土夹杂过多，不得计入补贴。</div>
          )}
          <label className="field" style={{ marginTop: 10 }}>
            <span>审核备注</span>
            <textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={busy} onClick={() => review('APPROVE')}>
              ✓ 审核通过（计入补贴）
            </button>
          </div>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <label className="field">
              <span>驳回原因</span>
              <select value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}>
                <option value="SOIL_CONTAMINATION">泥土夹杂过多</option>
                <option value="DUPLICATE_FILM">同一批膜重复过磅</option>
                <option value="OTHER">其他</option>
              </select>
            </label>
            <button className="btn danger" disabled={busy} onClick={() => review('REJECT')}>
              ✕ 驳回（不计补贴）
            </button>
          </div>
        </Modal>
      )}

      {/* 解除重复弹窗 */}
      {clearDupTarget && (
        <Modal title={`解除重复嫌疑 — ${clearDupTarget.ticketNo}`} onClose={() => setClearDupTarget(null)}>
          <div className="alert info">经现场/监控核实确非同一批膜时，填写核实结论后解除。</div>
          <label className="field">
            <span>核实结论（必填）</span>
            <textarea value={clearDupNote} onChange={(e) => setClearDupNote(e.target.value)} placeholder="如：核对运输车牌与装卸监控，为两地块分开采收的膜" />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={busy || !clearDupNote.trim()} onClick={clearDup}>
              确认解除
            </button>
            <button className="btn secondary" onClick={() => setClearDupTarget(null)}>
              取消
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

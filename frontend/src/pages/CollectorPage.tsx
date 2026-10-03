import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Card, GRADE_LABEL, Modal, ProgressLine, REJECT_LABEL } from '../components';

interface Plot {
  id: number;
  code: string;
  name: string;
  areaMu: number;
  farmer: { id: number; name: string; username: string };
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
  status: string;
  rejectReason: string | null;
  suspectedDuplicate: boolean;
  approvedSubsidyKg: number;
  subsidyYuan: number;
  isPaid: boolean;
  createdAt: string;
  plot: { code: string; name: string };
  farmer: { name: string };
}
interface ScaleReading {
  grossKg: number;
  tareKg: number;
  netKg: number;
  stable: boolean;
  deviceId: string;
}

const FILM_TYPES = ['PE', 'PVC', 'EVA', 'PO'];

export default function CollectorPage() {
  const [plots, setPlots] = useState<Plot[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState<RecordRow | null>(null);

  // 过磅表单
  const [plotId, setPlotId] = useState<number | ''>('');
  const [filmType, setFilmType] = useState('PE');
  const [expectedGross, setExpectedGross] = useState(120);
  const [expectedTare, setExpectedTare] = useState(5);
  const [reading, setReading] = useState<ScaleReading | null>(null);
  const [scaleLoading, setScaleLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 分拣弹窗
  const [sortTarget, setSortTarget] = useState<RecordRow | null>(null);
  const [sortedNet, setSortedNet] = useState(0);
  const [grade, setGrade] = useState('A');
  const [qualityNote, setQualityNote] = useState('');

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([
      api<Plot[]>('/plots'),
      api<RecordRow[]>(`/records${statusFilter ? `?status=${statusFilter}` : ''}`),
    ]);
    setPlots(p);
    setRecords(r);
  }, [statusFilter]);

  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  const readScale = async () => {
    setScaleLoading(true);
    setErr('');
    try {
      const r = await api<ScaleReading>('/scale/read', {
        method: 'POST',
        body: JSON.stringify({ expectedGross, expectedTare }),
      });
      setReading(r);
      setMsg(`地磅读数完成（设备 ${r.deviceId}，信号${r.stable ? '稳定' : '不稳定'}）`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setScaleLoading(false);
    }
  };

  const submitWeigh = async () => {
    if (!plotId || !reading) return;
    setSubmitting(true);
    setErr('');
    setMsg('');
    // 幂等键：同一地块+读数+时间窗，防止双击/重试产生重复单据
    const clientTicketNo = `WEB-${plotId}-${filmType}-${reading.grossKg}-${reading.tareKg}-${Date.now()}`;
    try {
      const res = await api<{ record: RecordRow; suspectedDuplicate?: boolean; duplicateOfTicketNo?: string; idempotentReplay?: boolean }>(
        '/records',
        {
          method: 'POST',
          body: JSON.stringify({
            plotId,
            filmType,
            grossWeightKg: reading.grossKg,
            tareWeightKg: reading.tareKg,
            clientTicketNo,
          }),
        },
      );
      if (res.suspectedDuplicate) {
        setMsg(`已登记 ${res.record.ticketNo}，但系统检测到与 ${res.duplicateOfTicketNo} 疑似同一批膜重复过磅，审核前需核实。`);
      } else {
        setMsg(`过磅登记成功：${res.record.ticketNo}，净重 ${res.record.netWeightKg} kg`);
      }
      setReading(null);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitSorting = async () => {
    if (!sortTarget) return;
    try {
      await api(`/records/${sortTarget.id}/sorting`, {
        method: 'POST',
        body: JSON.stringify({ sortedNetWeightKg: sortedNet, grade, qualityNote }),
      });
      setMsg(`分拣已提交：${sortTarget.ticketNo}`);
      setSortTarget(null);
      await load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="container">
      {msg && <div className="alert ok">{msg}</div>}
      {err && <div className="alert error">{err}</div>}

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <Card title="① 地磅读数（本地模拟）">
          <div className="grid grid-2">
            <label className="field">
              <span>预计毛重 kg（模拟上磅物料）</span>
              <input type="number" value={expectedGross} onChange={(e) => setExpectedGross(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>预计皮重 kg（包装物）</span>
              <input type="number" value={expectedTare} onChange={(e) => setExpectedTare(Number(e.target.value))} />
            </label>
          </div>
          <button className="btn secondary" onClick={readScale} disabled={scaleLoading}>
            {scaleLoading ? '读数中…' : '🔌 读取地磅'}
          </button>
          {reading && (
            <div className="scale-box" style={{ marginTop: 14 }}>
              <div className="muted">
                {reading.deviceId} · {reading.stable ? '✅ 稳定' : '⚠️ 不稳定'}
              </div>
              <div className="reading" style={{ fontSize: 24 }}>
                毛重 {reading.grossKg}
                <small> kg</small>
              </div>
              <div className="reading" style={{ fontSize: 24 }}>
                皮重 {reading.tareKg}
                <small> kg</small>
              </div>
              <div className="reading">
                {reading.netKg}
                <small> kg 净重</small>
              </div>
            </div>
          )}
        </Card>

        <Card title="② 过磅登记">
          <label className="field">
            <span>地块（种植户）</span>
            <select value={plotId} onChange={(e) => setPlotId(Number(e.target.value))}>
              <option value="">请选择地块</option>
              {plots.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} {p.name}（{p.farmer.name} · {p.areaMu}亩）
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>膜种类</span>
            <select value={filmType} onChange={(e) => setFilmType(e.target.value)}>
              {FILM_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <div className="muted" style={{ marginBottom: 10 }}>
            毛重/皮重取自地磅读数{reading ? `：${reading.grossKg} - ${reading.tareKg} = ${reading.netKg} kg` : '，请先读数'}
          </div>
          <button className="btn" onClick={submitWeigh} disabled={!reading || !plotId || submitting}>
            {submitting ? '提交中…' : '登记过磅单'}
          </button>
        </Card>
      </div>

      <Card
        title="过磅单据"
        extra={
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">全部状态</option>
            <option value="PENDING">待分拣</option>
            <option value="SORTED">待审核</option>
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
                <th>毛/皮/净</th>
                <th>分拣</th>
                <th>状态</th>
                <th>补贴</th>
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
                      {r.plot.code} {r.plot.name}
                    </div>
                  </td>
                  <td>{r.filmType}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {r.grossWeightKg}/{r.tareWeightKg}/<b>{r.netWeightKg}</b>
                  </td>
                  <td>
                    {r.sortedNetWeightKg != null ? (
                      <>
                        {r.sortedNetWeightKg}kg
                        <span className={`badge grade-${r.grade}`} style={{ marginLeft: 4 }}>
                          {r.grade}
                        </span>
                      </>
                    ) : (
                      <span className="muted">待分拣</span>
                    )}
                  </td>
                  <td>
                    <Badge status={r.status} />
                    {r.suspectedDuplicate && <span className="badge dup">重复嫌疑</span>}
                    <ProgressLine status={r.status} />
                    {r.status === 'REJECTED' && (
                      <div className="muted" style={{ color: 'var(--danger)' }}>
                        {REJECT_LABEL[r.rejectReason ?? 'OTHER']}
                      </div>
                    )}
                  </td>
                  <td>{r.status === 'APPROVED' ? `¥${r.subsidyYuan.toFixed(2)}` : <span className="muted">—</span>}</td>
                  <td>
                    <div className="row-actions">
                      {r.status === 'PENDING' && (
                        <button
                          className="btn sm"
                          onClick={() => {
                            setSortTarget(r);
                            setSortedNet(r.netWeightKg);
                            setGrade('A');
                            setQualityNote('');
                          }}
                        >
                          分拣录入
                        </button>
                      )}
                      <button className="btn secondary sm" onClick={() => setDetail(r)}>
                        详情
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {sortTarget && (
        <Modal title={`分拣录入 — ${sortTarget.ticketNo}`} onClose={() => setSortTarget(null)}>
          <div className="muted" style={{ marginBottom: 10 }}>
            过磅净重 {sortTarget.netWeightKg} kg（分拣净重不得大于过磅净重，异常须由审核人员修正）
          </div>
          <label className="field">
            <span>分拣后净重 kg（去除泥土杂物）</span>
            <input type="number" value={sortedNet} onChange={(e) => setSortedNet(Number(e.target.value))} />
          </label>
          <label className="field">
            <span>质量等级</span>
            <select value={grade} onChange={(e) => setGrade(e.target.value)}>
              {Object.entries(GRADE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>质检备注</span>
            <textarea value={qualityNote} onChange={(e) => setQualityNote(e.target.value)} placeholder="如：轻微泥沙，已拍打清理" />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={submitSorting}>
              提交分拣
            </button>
            <button className="btn secondary" onClick={() => setSortTarget(null)}>
              取消
            </button>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal title={`单据 ${detail.ticketNo}`} onClose={() => setDetail(null)}>
          <div className="detail-list">
            <div>
              <b>种植户/地块：</b>
              {detail.farmer.name} / {detail.plot.code} {detail.plot.name}
            </div>
            <div>
              <b>膜种：</b>
              {detail.filmType}
            </div>
            <div>
              <b>毛/皮/净：</b>
              {detail.grossWeightKg}/{detail.tareWeightKg}/{detail.netWeightKg} kg
            </div>
            <div>
              <b>分拣：</b>
              {detail.sortedNetWeightKg ?? '—'} kg / {detail.grade ?? '—'}
            </div>
            <div>
              <b>状态：</b>
              <Badge status={detail.status} />
            </div>
            <div>
              <b>核定补贴：</b>
              {detail.approvedSubsidyKg} kg / ¥{detail.subsidyYuan.toFixed(2)}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

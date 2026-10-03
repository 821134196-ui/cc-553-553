import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, FILM_LABEL, kg, Modal } from '../components';
import type { Ticket } from '../types';

export function ReviewerPage({ currentUserName }: { currentUserName: string }) {
  const [pending, setPending] = useState<Ticket[]>([]);
  const [all, setAll] = useState<Ticket[]>([]);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [rejecting, setRejecting] = useState<Ticket | null>(null);
  const [correcting, setCorrecting] = useState<Ticket | null>(null);
  const [detail, setDetail] = useState<Ticket | null>(null);

  const load = () =>
    Promise.all([
      api<Ticket[]>('/review/pending'),
      api<Ticket[]>('/tickets'),
    ]).then(([p, a]) => {
      setPending(p);
      setAll(a);
    });

  useEffect(() => {
    void load();
  }, []);

  const approve = async (t: Ticket) => {
    setMsg(null);
    try {
      const updated = await api<Ticket>(`/review/${t.id}`, { method: 'POST', body: { approved: true } });
      setMsg({
        kind: 'ok',
        text: `${updated.ticketNo} 已通过，确认补贴数量 ${updated.eligibleWeight}kg${updated.capNote ? `（${updated.capNote}）` : ''}`,
      });
      await load();
    } catch (e: any) {
      setMsg({ kind: 'error', text: e.message });
    }
  };

  return (
    <div>
      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}

      <div className="card">
        <h2>🔎 待审核队列（{pending.length}）</h2>
        <div className="note" style={{ marginBottom: 10 }}>
          登录审核人：{currentUserName}。收料员不能审批自己登记的单据；重复过磅、泥土夹杂 {'>'}10% 或 REJECT 等级只能驳回。
        </div>
        <table>
          <thead>
            <tr>
              <th>单号</th><th>种植户/地块</th><th>膜种/批次</th><th>净重</th><th>等级</th><th>含土率</th>
              <th>收料员</th><th>风险提示</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((t) => {
              const risks: string[] = [];
              if (t.duplicateOfId) risks.push(`疑似与 #${t.duplicateOfId} 同批膜重复过磅`);
              if ((t.dirtRate ?? 0) > 0.1) risks.push(`泥土夹杂 ${((t.dirtRate ?? 0) * 100).toFixed(1)}% 超限`);
              if (t.qualityGrade === 'REJECT') risks.push('分拣等级不合格');
              return (
                <tr key={t.id}>
                  <td className="nowrap">{t.ticketNo}</td>
                  <td>{t.farmer.name}<div className="note">{t.plot.code}（{t.plot.areaMu}亩）</div></td>
                  <td>{FILM_LABEL[t.filmType]}{t.batchCode && <div className="note">{t.batchCode}</div>}</td>
                  <td>{kg(t.netWeight)}</td>
                  <td>{t.qualityGrade && <Badge value={t.qualityGrade} prefix="grade-" />}</td>
                  <td>{((t.dirtRate ?? 0) * 100).toFixed(1)}%</td>
                  <td>{t.collector.name}</td>
                  <td>{risks.length > 0
                    ? risks.map((r) => <div key={r} style={{ color: 'var(--red)', fontSize: 12 }}>⛔ {r}</div>)
                    : <span className="muted">无</span>}</td>
                  <td className="nowrap">
                    <button className="btn small" onClick={() => void approve(t)}>通过</button>{' '}
                    <button className="btn small danger" onClick={() => setRejecting(t)}>驳回</button>{' '}
                    <button className="btn small amber" onClick={() => setCorrecting(t)}>称重修正</button>
                  </td>
                </tr>
              );
            })}
            {pending.length === 0 && (
              <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 20 }}>暂无待审核单据</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>审核记录与修正留痕</h2>
        <table>
          <thead>
            <tr>
              <th>单号</th><th>种植户/地块</th><th>净重</th><th>等级</th><th>状态</th>
              <th>合格量</th><th>审核人</th><th>上限裁剪说明 / 驳回原因</th><th>修正历史</th><th></th>
            </tr>
          </thead>
          <tbody>
            {all.map((t) => (
              <tr key={t.id}>
                <td className="nowrap">{t.ticketNo}</td>
                <td>{t.farmer.name}<div className="note">{t.plot.code}</div></td>
                <td>{kg(t.netWeight)}</td>
                <td>{t.qualityGrade ? <Badge value={t.qualityGrade} prefix="grade-" /> : '—'}</td>
                <td><Badge value={t.status} /></td>
                <td><strong>{kg(t.eligibleWeight)}</strong></td>
                <td>{t.reviewer?.name ?? '—'}</td>
                <td style={{ maxWidth: 260 }}>
                  {t.status === 'REJECTED'
                    ? <span style={{ color: 'var(--red)' }}>{t.rejectReason}</span>
                    : t.capNote
                      ? <span className="cap-note" style={{ display: 'block' }}>{t.capNote}</span>
                      : '—'}
                </td>
                <td style={{ maxWidth: 220 }}>
                  {t.corrections.length === 0 ? <span className="muted">无修正</span> : t.corrections.map((c) => (
                    <div key={c.id} className="note" style={{ marginBottom: 4 }}>
                      {c.fieldName}: {c.oldValue}→{c.newValue}kg<br />
                      原因：{c.reason}<br />复核人：{c.reviewer.name}
                    </div>
                  ))}
                </td>
                <td><button className="btn small secondary" onClick={() => setDetail(t)}>详情</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rejecting && <RejectModal ticket={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); void load(); }} />}
      {correcting && <CorrectionModal ticket={correcting} onClose={() => setCorrecting(null)} onDone={() => { setCorrecting(null); void load(); }} />}
      {detail && (
        <Modal title={`单据详情 ${detail.ticketNo}`} onClose={() => setDetail(null)}>
          <TicketDetailBody ticket={detail} />
          <div className="actions"><button className="btn secondary" onClick={() => setDetail(null)}>关闭</button></div>
        </Modal>
      )}
    </div>
  );
}

export function TicketDetailBody({ ticket }: { ticket: Ticket }) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.9 }}>
      <div>种植户：{ticket.farmer.name}　地块：{ticket.plot.code} {ticket.plot.name}（{ticket.plot.areaMu}亩）</div>
      <div>膜种类：{FILM_LABEL[ticket.filmType]}　批次：{ticket.batchCode ?? '—'}</div>
      <div>毛重 {ticket.grossWeight}kg / 皮重 {ticket.tareWeight}kg / 初始净重 {ticket.rawNetWeight}kg / 分拣净重 {ticket.netWeight ?? '—'}kg</div>
      <div>等级 {ticket.qualityGrade ?? '—'}　泥土比例 {ticket.dirtRate == null ? '—' : `${(ticket.dirtRate * 100).toFixed(1)}%`}</div>
      <div>收料员：{ticket.collector.name}　审核人：{ticket.reviewer?.name ?? '—'}</div>
      <div>状态：<Badge value={ticket.status} />　确认补贴量：{ticket.eligibleWeight}kg　已兑付：{ticket.paidWeight}kg</div>
      {ticket.capNote && <div className="cap-note">{ticket.capNote}</div>}
      {ticket.rejectReason && <div style={{ color: 'var(--red)' }}>驳回原因：{ticket.rejectReason}</div>}
      <div style={{ marginTop: 8 }}>
        <strong>修正记录：</strong>
        {ticket.corrections.length === 0 ? <span className="muted"> 无</span> : (
          <table>
            <thead><tr><th>字段</th><th>原值</th><th>新值</th><th>原因</th><th>复核人</th></tr></thead>
            <tbody>
              {ticket.corrections.map((c) => (
                <tr key={c.id}>
                  <td>{c.fieldName}</td><td>{c.oldValue}</td><td>{c.newValue}</td>
                  <td>{c.reason}</td><td>{c.reviewer.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function RejectModal({ ticket, onClose, onDone }: { ticket: Ticket; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    if (!reason.trim()) { setError('驳回必须填写原因'); return; }
    try {
      await api(`/review/${ticket.id}`, { method: 'POST', body: { approved: false, reason } });
      onDone();
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <Modal title={`驳回单据 ${ticket.ticketNo}`} onClose={onClose}>
      {error && <div className="alert error">{error}</div>}
      <label>驳回原因（将展示给种植户）
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如：同批膜重复过磅 / 泥土夹杂超标 / 等级不合格" />
      </label>
      <div className="actions">
        <button className="btn secondary" onClick={onClose}>取消</button>
        <button className="btn danger" onClick={submit}>确认驳回</button>
      </div>
    </Modal>
  );
}

function CorrectionModal({ ticket, onClose, onDone }: { ticket: Ticket; onClose: () => void; onDone: () => void }) {
  const [fieldName, setFieldName] = useState<'GROSS' | 'TARE' | 'NET'>('NET');
  const [newValue, setNewValue] = useState<number>(ticket.netWeight ?? 0);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const current = fieldName === 'GROSS' ? ticket.grossWeight : fieldName === 'TARE' ? ticket.tareWeight : ticket.netWeight ?? 0;

  const submit = async () => {
    setError('');
    if (!reason.trim()) { setError('修正必须填写原因'); return; }
    try {
      await api(`/tickets/${ticket.id}/corrections`, {
        method: 'POST',
        body: { fieldName, newValue: Number(newValue), reason },
      });
      onDone();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <Modal title={`称重修正 — ${ticket.ticketNo}`} onClose={onClose}>
      {error && <div className="alert error">{error}</div>}
      <div className="note" style={{ marginBottom: 10 }}>
        修正不会抹除原始读数：原值、新值、原因与复核人将永久留痕。收料员不能复核自己的单据。
      </div>
      <label>修正字段
        <select value={fieldName} onChange={(e) => {
          const f = e.target.value as 'GROSS' | 'TARE' | 'NET';
          setFieldName(f);
          setNewValue(f === 'GROSS' ? ticket.grossWeight : f === 'TARE' ? ticket.tareWeight : ticket.netWeight ?? 0);
        }}>
          <option value="GROSS">毛重 GROSS</option>
          <option value="TARE">皮重 TARE</option>
          <option value="NET">净重 NET</option>
        </select>
      </label>
      <label>原值：{current} kg</label>
      <label>修正后数值 kg
        <input type="number" step="0.1" min="0" value={newValue} onChange={(e) => setNewValue(Number(e.target.value))} />
      </label>
      <label>修正原因
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如：复磅发现夹带石块扣减 2kg" />
      </label>
      <div className="actions">
        <button className="btn secondary" onClick={onClose}>取消</button>
        <button className="btn amber" onClick={submit}>确认修正（留痕）</button>
      </div>
    </Modal>
  );
}

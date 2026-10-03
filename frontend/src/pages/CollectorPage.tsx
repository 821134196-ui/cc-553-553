import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Badge, FILM_LABEL, kg, Modal } from '../components';
import type { MasterData, Ticket } from '../types';

export function CollectorPage() {
  const [master, setMaster] = useState<MasterData | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [farmerId, setFarmerId] = useState<number | ''>('');
  const [plotId, setPlotId] = useState<number | ''>('');
  const [filmType, setFilmType] = useState<'MULCH' | 'SHED'>('MULCH');
  const [batchCode, setBatchCode] = useState('');
  const [expectedKg, setExpectedKg] = useState<number | ''>('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [sortingTicket, setSortingTicket] = useState<Ticket | null>(null);

  const load = () =>
    api<Ticket[]>('/tickets').then(setTickets).catch(() => undefined);

  useEffect(() => {
    api<MasterData>('/master-data').then((d) => {
      setMaster(d);
      if (d.farmers[0]) setFarmerId(d.farmers[0].id);
    });
    void load();
  }, []);

  const plots = useMemo(
    () => (master?.plots ?? []).filter((p) => !farmerId || p.farmerId === farmerId),
    [master, farmerId],
  );

  const weighIn = async () => {
    setMsg(null);
    if (!farmerId || !plotId) {
      setMsg({ kind: 'error', text: '请选择种植户和地块' });
      return;
    }
    try {
      const res = await api<{ ticket: Ticket; warning: string | null }>('/tickets', {
        method: 'POST',
        body: {
          farmerId,
          plotId,
          filmType,
          batchCode: batchCode || undefined,
          expectedKg: expectedKg === '' ? undefined : Number(expectedKg),
        },
      });
      setMsg({
        kind: res.warning ? 'warn' : 'ok',
        text: res.warning
          ? res.warning
          : `过磅成功 ${res.ticket.ticketNo}：毛重 ${res.ticket.grossWeight}kg / 皮重 ${res.ticket.tareWeight}kg（模拟地磅读数）`,
      });
      setBatchCode('');
      await load();
    } catch (e: any) {
      setMsg({ kind: 'error', text: e.message });
    }
  };

  return (
    <div>
      <div className="card">
        <h2>📟 过磅登记（地磅读数本地模拟）</h2>
        {msg && <div className={`alert ${msg.kind === 'warn' ? 'warn' : msg.kind}`}>{msg.text}</div>}
        <form
          className="row-form"
          onSubmit={(e) => {
            e.preventDefault();
            void weighIn();
          }}
        >
          <label className="field">
            种植户
            <select value={farmerId} onChange={(e) => { setFarmerId(Number(e.target.value)); setPlotId(''); }}>
              {master?.farmers.map((f) => (
                <option key={f.id} value={f.id}>{f.name}（{f.username}）</option>
              ))}
            </select>
          </label>
          <label className="field">
            地块
            <select value={plotId} onChange={(e) => setPlotId(Number(e.target.value))}>
              <option value="">请选择</option>
              {plots.map((p) => (
                <option key={p.id} value={p.id}>{p.code} {p.name}（{p.areaMu}亩）</option>
              ))}
            </select>
          </label>
          <label className="field">
            膜种类
            <select value={filmType} onChange={(e) => setFilmType(e.target.value as 'MULCH' | 'SHED')}>
              <option value="MULCH">地膜</option>
              <option value="SHED">棚膜</option>
            </select>
          </label>
          <label className="field">
            批次标记（可选）
            <input value={batchCode} onChange={(e) => setBatchCode(e.target.value)} placeholder="如 BATCH-Z-01" />
          </label>
          <label className="field">
            模拟净重基准 kg
            <input type="number" step="0.1" value={expectedKg} onChange={(e) => setExpectedKg(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <button className="btn" type="submit">读取地磅并登记</button>
        </form>
        <div className="note">毛重/皮重由模拟地磅自动写入，收料员不可手工录入；同批次或读数完全相同的单据会自动标记为疑似重复过磅。</div>
      </div>

      <div className="card">
        <h2>过磅单据（补充分拣结果）</h2>
        <table>
          <thead>
            <tr>
              <th>单号</th><th>种植户/地块</th><th>膜种</th><th>毛重</th><th>皮重</th>
              <th>净重</th><th>等级</th><th>含土率</th><th>状态</th><th></th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id}>
                <td className="nowrap">{t.ticketNo}{t.batchCode ? <div className="note">批次 {t.batchCode}</div> : null}</td>
                <td>{t.farmer.name}<div className="note">{t.plot.code}</div></td>
                <td>{FILM_LABEL[t.filmType]}</td>
                <td>{kg(t.grossWeight)}</td>
                <td>{kg(t.tareWeight)}</td>
                <td>{t.netWeight == null ? <span className="muted">待分拣</span> : kg(t.netWeight)}</td>
                <td>{t.qualityGrade ? <Badge value={t.qualityGrade} prefix="grade-" /> : '—'}</td>
                <td>{t.dirtRate == null ? '—' : `${(t.dirtRate * 100).toFixed(1)}%`}</td>
                <td>
                  <Badge value={t.status} />
                  {t.duplicateOfId && <div className="cap-note">疑似重复 #{t.duplicateOfId}</div>}
                  {t.rejectReason && <div className="note" style={{ color: 'var(--red)' }}>{t.rejectReason}</div>}
                </td>
                <td>
                  {t.status === 'PENDING_SORTING' && (
                    <button className="btn small" onClick={() => setSortingTicket(t)}>补充分拣</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sortingTicket && <SortingModal ticket={sortingTicket} onClose={() => setSortingTicket(null)} onDone={() => { setSortingTicket(null); void load(); }} />}
    </div>
  );
}

function SortingModal({ ticket, onClose, onDone }: { ticket: Ticket; onClose: () => void; onDone: () => void }) {
  const maxNet = Math.round((ticket.grossWeight - ticket.tareWeight + 0.5) * 100) / 100;
  const [netWeight, setNetWeight] = useState(maxNet);
  const [qualityGrade, setGrade] = useState<'A' | 'B' | 'REJECT'>('A');
  const [dirtRate, setDirtRate] = useState(0.02);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    try {
      await api(`/tickets/${ticket.id}/sorting`, {
        method: 'POST',
        body: { netWeight: Number(netWeight), qualityGrade, dirtRate: Number(dirtRate) },
      });
      onDone();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <Modal title={`分拣补充 — ${ticket.ticketNo}`} onClose={onClose}>
      {error && <div className="alert error">{error}</div>}
      <div className="note" style={{ marginBottom: 10 }}>
        {ticket.farmer.name} / {ticket.plot.code} / 毛重 {ticket.grossWeight}kg − 皮重 {ticket.tareWeight}kg
      </div>
      <label>分拣净重 kg（≤ {maxNet}kg）
        <input type="number" step="0.1" min="0" max={maxNet} value={netWeight} onChange={(e) => setNetWeight(Number(e.target.value))} />
      </label>
      <label>质量等级
        <select value={qualityGrade} onChange={(e) => setGrade(e.target.value as 'A' | 'B' | 'REJECT')}>
          <option value="A">A 级（全额计补贴）</option>
          <option value="B">B 级（按 85% 计）</option>
          <option value="REJECT">不合格（REJECT）</option>
        </select>
      </label>
      <label>泥土夹杂比例（{'>'}10% 不得计入补贴）
        <input type="number" step="0.01" min="0" max="1" value={dirtRate} onChange={(e) => setDirtRate(Number(e.target.value))} />
        <span className="note">当前 {(Number(dirtRate) * 100).toFixed(1)}%</span>
      </label>
      <div className="actions">
        <button className="btn secondary" onClick={onClose}>取消</button>
        <button className="btn" onClick={submit}>提交分拣，送审</button>
      </div>
    </Modal>
  );
}

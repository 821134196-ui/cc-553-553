import { ReactNode } from 'react';

export const STATUS_LABEL: Record<string, string> = {
  PENDING: '待分拣',
  SORTED: '待审核',
  APPROVED: '审核通过',
  REJECTED: '已驳回',
};

export const REJECT_LABEL: Record<string, string> = {
  SOIL_CONTAMINATION: '泥土夹杂过多',
  DUPLICATE_FILM: '同一批膜重复过磅',
  OTHER: '其他原因',
};

export const GRADE_LABEL: Record<string, string> = {
  A: 'A级（干净）',
  B: 'B级（少量杂质×80%）',
  C: 'C级（泥土过多）',
  REJECT: '拒收',
};

export function Badge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function ProgressLine({ status }: { status: string }) {
  const step = (name: string, key: string) => {
    const order = ['PENDING', 'SORTED', 'APPROVED'];
    let cls = '';
    if (status === 'REJECTED') {
      cls = ['PENDING', 'SORTED'].includes(key) ? 'done' : key === 'APPROVED' ? 'fail' : '';
      if (key === 'APPROVED') name = '驳回';
    } else {
      cls = order.indexOf(status) >= order.indexOf(key) ? 'done' : '';
    }
    return (
      <div key={key} className={`step ${cls}`}>
        {name}
      </div>
    );
  };
  return (
    <div className="progress-line">
      {step('过磅', 'PENDING')}
      {step('分拣', 'SORTED')}
      {step('审核/兑付', 'APPROVED')}
    </div>
  );
}

export function Card({ title, children, extra }: { title?: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="card">
      {title && (
        <h2 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {title}
          {extra}
        </h2>
      )}
      {children}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

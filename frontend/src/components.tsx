import React from 'react';

export type { Role, User } from './api';


export const STATUS_LABEL: Record<string, string> = {
  PENDING_SORTING: '待分拣',
  PENDING_REVIEW: '待审核',
  APPROVED: '审核通过',
  REJECTED: '已驳回',
};

export const FILM_LABEL: Record<string, string> = {
  MULCH: '地膜',
  SHED: '棚膜',
};

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: '管理员',
  COLLECTOR: '收料员',
  REVIEWER: '审核人员',
  FARMER: '种植户',
};

export function Badge({ value, labelMap, prefix = '' }: { value: string; labelMap?: Record<string, string>; prefix?: string }) {
  return (
    <span className={`badge ${prefix}${value}`}>
      {labelMap?.[value] ?? STATUS_LABEL[value] ?? value}
    </span>
  );
}

export function Progress({ status }: { status: string }) {
  const steps = ['过磅', '分拣', '审核', '补贴'];
  const idx =
    status === 'PENDING_SORTING' ? 1 : status === 'PENDING_REVIEW' ? 2 : status === 'APPROVED' ? 4 : 2;
  return (
    <span className="progress-step">
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <span className={`dot ${status === 'REJECTED' && i === idx ? 'rej' : i < idx ? 'on' : ''}`} />
          <span className={i < idx ? '' : 'muted'}>{s}</span>
          {i < steps.length - 1 && <span className="muted">→</span>}
        </React.Fragment>
      ))}
    </span>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function kg(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Math.round(n * 100) / 100} kg`;
}

export function yuan(n: number | null | undefined): string {
  if (n == null) return '—';
  return `¥${(Math.round(n * 100) / 100).toFixed(2)}`;
}

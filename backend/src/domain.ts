export const ROLES = {
  FARMER: 'FARMER', // 种植户
  COLLECTOR: 'COLLECTOR', // 收料员
  REVIEWER: 'REVIEWER', // 审核人员
  ADMIN: 'ADMIN', // 管理员
} as const;

export const RECORD_STATUS = {
  PENDING: 'PENDING', // 已过磅，待分拣
  SORTED: 'SORTED', // 已分拣，待审核
  APPROVED: 'APPROVED', // 审核通过，进入补贴清单
  REJECTED: 'REJECTED', // 审核驳回，不计补贴
} as const;

export const GRADES = {
  A: 'A', // 干净，足额计补
  B: 'B', // 少量杂质，按 80% 折算
  C: 'C', // 泥土夹杂过多，不合格
  REJECT: 'REJECT',
} as const;

/** 质量等级 → 合格量折算系数 */
export const GRADE_FACTOR: Record<string, number> = {
  A: 1.0,
  B: 0.8,
  C: 0,
  REJECT: 0,
};

export const REJECT_REASONS = {
  SOIL_CONTAMINATION: 'SOIL_CONTAMINATION', // 泥土夹杂过多
  DUPLICATE_FILM: 'DUPLICATE_FILM', // 同一批膜重复过磅
  OTHER: 'OTHER',
} as const;

export const CORRECTABLE_FIELDS = {
  GROSS_WEIGHT: 'GROSS_WEIGHT',
  TARE_WEIGHT: 'TARE_WEIGHT',
  SORTED_NET_WEIGHT: 'SORTED_NET_WEIGHT',
  GRADE: 'GRADE',
} as const;

export const FILM_TYPES = ['PE', 'PVC', 'EVA', 'PO'];

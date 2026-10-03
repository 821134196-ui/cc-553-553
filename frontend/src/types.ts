export interface MasterData {
  farmers: { id: number; name: string; username: string }[];
  plots: { id: number; code: string; name: string; areaMu: number; farmerId: number }[];
  periods: {
    id: number;
    code: string;
    name: string;
    ratePerKg: number;
    kgPerMu: number;
    totalQuotaKg: number;
    active: boolean;
  }[];
}

export interface Ticket {
  id: number;
  ticketNo: string;
  periodId: number;
  period: { id: number; code: string; name: string; ratePerKg: number };
  farmerId: number;
  farmer: { id: number; name: string; username: string };
  plotId: number;
  plot: { id: number; code: string; name: string; areaMu: number };
  filmType: string;
  batchCode: string | null;
  grossWeight: number;
  tareWeight: number;
  netWeight: number | null;
  rawNetWeight: number;
  qualityGrade: string | null;
  dirtRate: number | null;
  status: string;
  rejectReason: string | null;
  duplicateOfId: number | null;
  duplicateOf?: { id: number; ticketNo: string } | null;
  eligibleWeight: number;
  capNote: string | null;
  paidWeight: number;
  collector: { id: number; name: string };
  reviewer?: { id: number; name: string } | null;
  createdAt: string;
  corrections: {
    id: number;
    fieldName: string;
    oldValue: number;
    newValue: number;
    reason: string;
    reviewer: { id: number; name: string };
    createdAt: string;
  }[];
}

export interface PlotSummaryRow {
  plotId: number;
  plotCode: string;
  plotName: string;
  areaMu: number;
  farmer: { id: number; name: string; username: string };
  recoveredKg: number;
  eligibleKg: number;
  paidKg: number;
  pendingKg: number;
  rejectedCount: number;
}

export interface QuotaRow {
  periodId: number;
  code: string;
  name: string;
  ratePerKg: number;
  kgPerMu: number;
  totalQuotaKg: number;
  approvedKg: number;
  paidKg: number;
  remainingKg: number;
  quotaReached: boolean;
}

export interface Payout {
  id: number;
  receiptNo: string;
  periodId: number;
  period: { id: number; code: string; name: string };
  farmerId: number;
  farmer: { id: number; name: string; username: string };
  totalWeight: number;
  amount: number;
  createdAt: string;
  lines: {
    id: number;
    weight: number;
    amount: number;
    plotId: number;
    plot: { code: string; name: string };
    ticket: { id: number; ticketNo: string };
  }[];
}

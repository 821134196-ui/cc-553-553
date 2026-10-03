import { Injectable } from '@nestjs/common';

/**
 * 本地模拟地磅读数。
 * 真实场景由串口/称重仪表推送，这里以“基准重量 + 固定扰动”模拟稳定读数，
 * 同一读数可复现，便于演示重复过磅与修正场景。
 */
@Injectable()
export class ScaleService {
  private seq = 1000;

  read(expectedKg?: number): { grossWeight: number; tareWeight: number; stable: boolean; deviceTime: string } {
    const base = expectedKg ?? 0;
    // 末位 ±0.02kg 的仪表跳变
    const jitter = ((this.seq++ % 3) - 1) * 0.02;
    return {
      grossWeight: Math.round((base + 40 + jitter) * 100) / 100, // 含载物筐自重 40kg
      tareWeight: 40,
      stable: true,
      deviceTime: new Date().toISOString(),
    };
  }
}

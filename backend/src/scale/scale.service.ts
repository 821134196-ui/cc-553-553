import { Injectable } from '@nestjs/common';

export interface ScaleReadingResult {
  grossKg: number;
  tareKg: number;
  netKg: number;
  stable: boolean;
  deviceId: string;
  readAt: string;
}

/**
 * 本地模拟地磅：
 * - stable=true 表示读数稳定；
 * - 读数保留两位小数并带微小抖动，模拟真实设备；
 * - 真实项目应替换为串口/地磅仪表驱动（如耀华 XK3190）。
 */
@Injectable()
export class ScaleService {
  private readonly deviceId = 'SCALE-SIM-01';

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  /** 读取一次完整过磅（毛重 + 皮重）。入参为期望重量，用于演示 */
  read(expectedGross = 120, expectedTare = 5): ScaleReadingResult {
    const jitter = () => this.round2((Math.random() - 0.5) * 0.2);
    const grossKg = Math.max(0, this.round2(expectedGross + jitter()));
    const tareKg = Math.max(0, this.round2(expectedTare + jitter() * 0.5));
    return {
      grossKg,
      tareKg,
      netKg: this.round2(grossKg - tareKg),
      stable: true,
      deviceId: this.deviceId,
      readAt: new Date().toISOString(),
    };
  }
}

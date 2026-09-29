export type PrintPaper = 'THERMAL_58MM' | 'THERMAL_80MM' | 'A4';

export const PRINT_PROFILES = {
  THERMAL_58MM: { label: '2-inch Thermal', widthMm: 58 },
  THERMAL_80MM: { label: '3-inch Thermal', widthMm: 80 },
  A4: { label: 'A4 Invoice', widthMm: 210, heightMm: 297 }
} as const;

export interface PrinterAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<'READY' | 'OFFLINE' | 'ERROR'>;
  testPrint(): Promise<void>;
  printReceipt(payload: Uint8Array): Promise<void>;
}

import { authenticatedApiRequest } from '@/lib/firebase';

export const installationPackages = [
  { code: 'SCH_58MM', name: '2-inch (58 mm) SCH printer', amount: 2199, printerType: 'THERMAL_58MM' },
  { code: 'STANDARD_58MM', name: '2-inch (58 mm) normal printer', amount: 3099, printerType: 'THERMAL_58MM' },
  { code: 'STANDARD_80MM', name: '3-inch (80 mm) normal printer', amount: 3999, printerType: 'THERMAL_80MM' },
  { code: 'AUTO_CUTTER_80MM', name: '3-inch (80 mm) auto-cutter printer', amount: 4999, printerType: 'THERMAL_80MM' }
] as const;

export type InstallationPackageCode = (typeof installationPackages)[number]['code'];
export type InstallationPaymentMethod = 'CASHFREE' | 'CASH_ON_INSTALLATION';
export type InstallationApplication = {
  business_name: string;
  owner_name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  admin_note: string | null;
  created_at: string;
  installation_package_code: InstallationPackageCode | null;
  installation_amount: number | null;
  installation_payment_method: InstallationPaymentMethod | null;
  installation_payment_status: 'CREATED' | 'DUE' | 'PAID' | 'COLLECTED' | 'CLOSED' | null;
  installation_order_id: string | null;
  installation_paid_at: string | null;
  installation_collected_at: string | null;
};

export function installationPackageName(code: string | null | undefined) {
  return installationPackages.find(item => item.code === code)?.name ?? '—';
}

export function installationPrinterType(code: string | null | undefined) {
  return installationPackages.find(item => item.code === code)?.printerType ?? '';
}

export function createInstallationCheckout() {
  return authenticatedApiRequest<{
    success: true;
    data: {
      orderId: string;
      paymentSessionId: string | null;
      amount: number;
      currency: string;
      mode: 'sandbox' | 'production';
      alreadyPaid: boolean;
    };
  }>('/auth/installation/checkout', { method: 'POST' });
}

export function verifyInstallationPayment(orderId: string) {
  return authenticatedApiRequest<{
    success: true;
    data: { verified: boolean; providerStatus: string };
  }>('/auth/installation/verify', {
    method: 'POST',
    body: JSON.stringify({ orderId })
  });
}

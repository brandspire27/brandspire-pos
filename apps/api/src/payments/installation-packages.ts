export const installationPackages = {
  SCH_58MM: { name: '2-inch (58 mm) SCH printer', amount: 2199, printerType: 'THERMAL_58MM' },
  STANDARD_58MM: { name: '2-inch (58 mm) normal printer', amount: 3099, printerType: 'THERMAL_58MM' },
  STANDARD_80MM: { name: '3-inch (80 mm) normal printer', amount: 3999, printerType: 'THERMAL_80MM' },
  AUTO_CUTTER_80MM: { name: '3-inch (80 mm) auto-cutter printer', amount: 4999, printerType: 'THERMAL_80MM' }
} as const;

export type InstallationPackageCode = keyof typeof installationPackages;
export type InstallationPaymentMethod = 'CASHFREE' | 'CASH_ON_INSTALLATION';

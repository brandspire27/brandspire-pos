'use client';

import { useEffect, useState } from 'react';

type Health = {
  success?: boolean;
  status?: string;
  version?: string;
  environment?: string;
  database?: string;
  latencyMs?: number;
};

type Release = {
  maintenance?: { mode?: string; message?: string };
  payments?: { provider?: string; configured?: boolean; environment?: string };
  android?: { latestVersionName?: string; minVersionCode?: number; recommendedVersionCode?: number };
};

export default function StatusPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [ready, setReady] = useState<Health | null>(null);
  const [release, setRelease] = useState<Release | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const base = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
    Promise.all([
      fetch(`${base}/api/health`, { cache: 'no-store' }).then((r) => r.json()),
      fetch(`${base}/api/health/ready`, { cache: 'no-store' }).then((r) => r.json()),
      fetch(`${base}/api/health/release`, { cache: 'no-store' }).then((r) => r.json())
    ])
      .then(([h, r, rel]) => { setHealth(h); setReady(r); setRelease(rel); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Status check failed'));
  }, []);

  const card = (label: string, value: string, note?: string) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      {note ? <p className="mt-1 text-sm text-slate-500">{note}</p> : null}
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <p className="text-sm font-semibold text-blue-600">Brandspire POS</p>
          <h1 className="mt-2 text-3xl font-bold">System Status</h1>
          <p className="mt-2 text-slate-600">Launch-readiness view for API, database, payments and Android release policy.</p>
        </div>
        {error ? <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div> : null}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {card('API', health?.status === 'ok' ? 'Operational' : 'Checking…', health?.version ? `v${health.version} · ${health.environment}` : undefined)}
          {card('Database', ready?.database === 'ok' ? 'Connected' : 'Checking…', ready?.latencyMs != null ? `${ready.latencyMs} ms readiness` : undefined)}
          {card('Maintenance', release?.maintenance?.mode ?? 'Checking…', release?.maintenance?.message)}
          {card('Payments', release?.payments?.configured ? 'Configured' : 'Not configured', release?.payments ? `${release.payments.provider} · ${release.payments.environment}` : undefined)}
          {card('Android', release?.android?.latestVersionName ? `v${release.android.latestVersionName}` : 'Checking…', release?.android ? `Min code ${release.android.minVersionCode} · recommended ${release.android.recommendedVersionCode}` : undefined)}
        </div>
      </div>
    </main>
  );
}

"use client";
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import InvoiceDetailView from '@/components/pos/InvoiceDetailView';
function Detail(){const id=useSearchParams().get('id');return id?<InvoiceDetailView invoiceId={id} portal="owner"/>:<p role="alert">Invoice ID missing.</p>;}
export default function Page(){return <Suspense fallback={<p>Loading invoice…</p>}><Detail/></Suspense>;}

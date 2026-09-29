'use client';
import { useParams } from 'next/navigation';
import InvoiceDetailView from '@/components/pos/InvoiceDetailView';
export default function OwnerInvoiceDetailPage(){ const params=useParams<{id:string}>(); return <InvoiceDetailView invoiceId={params.id} portal="owner"/>; }

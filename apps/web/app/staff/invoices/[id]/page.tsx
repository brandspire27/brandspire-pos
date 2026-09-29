'use client';
import { useParams } from 'next/navigation';
import InvoiceDetailView from '@/components/pos/InvoiceDetailView';
export default function StaffInvoiceDetailPage(){ const params=useParams<{id:string}>(); return <InvoiceDetailView invoiceId={params.id} portal="staff"/>; }

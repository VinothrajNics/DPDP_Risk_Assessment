'use client';

import { useParams } from 'next/navigation';
import AdminDetailView from '@/components/AdminDetailView';

export default function AdminDetailPage() {
  const params = useParams<{ id: string }>();
  return <AdminDetailView id={params.id} />;
}

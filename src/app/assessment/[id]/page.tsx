'use client';

import { useParams } from 'next/navigation';
import AssessmentView from '@/components/AssessmentView';

export default function AssessmentPage() {
  const params = useParams<{ id: string }>();
  return <AssessmentView id={params.id} />;
}

import { useParams } from 'wouter';
import { DailyVerse } from '@/components/home/DailyVerse';

export default function DailyVersePage() {
  const params = useParams<{ date?: string }>();
  return (
    <div className="container max-w-2xl mx-auto px-4 py-8">
      <DailyVerse date={params.date} />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { getReceipts } from '@/lib/confessionReceipt';
import { getConfessionStatuses, type ConfessionStatus } from '@/lib/confessionStatus';

export function useConfessionStatus() {
  const [removed,     setRemoved]     = useState<ConfessionStatus[]>([]);
  const [underReview, setUnderReview] = useState(0);
  const [checked,     setChecked]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const receipts = await getReceipts();
        if (receipts.length === 0) { setChecked(true); return; }
        const statuses = await getConfessionStatuses(receipts.map(r => r.id));
        if (cancelled) return;
        setRemoved(statuses.filter(s => s.status === 'removed'));
        setUnderReview(statuses.filter(s => s.status === 'under_review').length);
      } catch {
        // best-effort — never block the UI on a status check failure
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { removed, underReview, checked };
}

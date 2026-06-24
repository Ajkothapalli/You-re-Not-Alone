import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getReceipts, hasSeen, markSeen } from '@/lib/confessionReceipt';

export function useReturnLoop() {
  const [totalNewFelt, setTotalNewFelt] = useState(0);
  const [visible,      setVisible]      = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (await hasSeen()) return;

      const receipts = await getReceipts();
      if (!receipts.length) return;

      const { data } = await supabase
        .from('confessions_public')
        .select('id, felt_count')
        .in('id', receipts.map(r => r.id));

      if (cancelled || !data?.length) return;

      let delta = 0;
      for (const row of data) {
        const r = receipts.find(r => r.id === row.id);
        if (r) delta += Math.max(0, (row.felt_count as number) - r.feltCountAtSubmit);
      }

      if (delta > 0) {
        setTotalNewFelt(delta);
        setVisible(true);
      }
    })().catch(() => {});

    return () => { cancelled = true; };
  }, []);

  function dismiss() {
    setVisible(false);
    markSeen().catch(() => {});
  }

  return { totalNewFelt, visible, dismiss };
}

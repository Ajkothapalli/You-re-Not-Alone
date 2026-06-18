/**
 * PremiumProvider — app-wide premium entitlement state.
 *
 * Initializes RevenueCat against the signed-in Supabase user, exposes
 * isPremium + a refresh(), and listens for entitlement changes (e.g. a
 * purchase or restore elsewhere in the app). When billing isn't available
 * (Expo Go / no keys), isPremium is simply false and everything still works.
 */

import Purchases from 'react-native-purchases';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { billingAvailable, checkPremium, initPurchases } from './purchases';

interface PremiumState {
  isPremium: boolean;
  ready:     boolean;
  refresh:   () => Promise<void>;
}

const PremiumContext = createContext<PremiumState>({
  isPremium: false,
  ready:     false,
  refresh:   async () => {},
});

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const [ready,     setReady]     = useState(false);

  async function refresh() {
    setIsPremium(await checkPremium());
  }

  useEffect(() => {
    // Module-level listener; removed by reference on unmount.
    const onUpdate = (info: { entitlements: { active: Record<string, unknown> } }) => {
      setIsPremium(info.entitlements.active['premium'] !== undefined);
    };
    let listening = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && billingAvailable()) {
        await initPurchases(user.id);
        await refresh();
        // React to purchases/restores/renewals from anywhere.
        Purchases.addCustomerInfoUpdateListener(onUpdate);
        listening = true;
      }
      setReady(true);
    })();

    return () => {
      if (listening) Purchases.removeCustomerInfoUpdateListener(onUpdate);
    };
  }, []);

  return (
    <PremiumContext.Provider value={{ isPremium, ready, refresh }}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium(): PremiumState {
  return useContext(PremiumContext);
}

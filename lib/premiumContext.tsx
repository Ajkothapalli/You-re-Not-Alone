/**
 * PremiumProvider — app-wide premium entitlement state.
 *
 * Initializes RevenueCat against the signed-in Supabase user, exposes
 * isPremium + a refresh(), and listens for entitlement changes (e.g. a
 * purchase or restore elsewhere in the app). When billing isn't available
 * (Expo Go / no keys), isPremium is simply false and everything still works.
 */

import Purchases from 'react-native-purchases';
import React, { useCallback, useMemo, createContext, useContext, useEffect, useState } from 'react';
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

  // useCallback: it is part of the memoized context value below, so a fresh
  // identity each render would change that value each render and undo the
  // memo entirely.
  const refresh = useCallback(async () => {
    setIsPremium(await checkPremium());
  }, []);

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

  /**
   * Memoized for the same reason as the theme value: an inline object gets a
   * new identity every render, and a changed context value re-renders every
   * consumer unconditionally — React.memo cannot stop it, because context is
   * not a prop.
   */
  const premiumValue = useMemo(
    () => ({ isPremium, ready, refresh }), [isPremium, ready, refresh]);


  return (
    <PremiumContext.Provider value={premiumValue}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium(): PremiumState {
  return useContext(PremiumContext);
}

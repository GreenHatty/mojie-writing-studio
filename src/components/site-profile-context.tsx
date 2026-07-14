'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type SiteProfile = {
  siteName: string;
  defaultInviteHours: number;
};

type SiteProfileContextValue = SiteProfile & {
  setSiteName: (name: string) => void;
  setDefaultInviteHours: (hours: number) => void;
};

const DEFAULT_PROFILE: SiteProfile = { siteName: '墨界·私人网文创作台', defaultInviteHours: 72 };
const SiteProfileContext = createContext<SiteProfileContextValue>({
  ...DEFAULT_PROFILE,
  setSiteName: () => undefined,
  setDefaultInviteHours: () => undefined
});

export function SiteProfileProvider({ children }: { children: ReactNode }) {
  const [siteName, setSiteName] = useState(DEFAULT_PROFILE.siteName);
  const [defaultInviteHours, setDefaultInviteHours] = useState(DEFAULT_PROFILE.defaultInviteHours);
  useEffect(() => { document.title = siteName; }, [siteName]);
  const value = useMemo(() => ({ siteName, defaultInviteHours, setSiteName, setDefaultInviteHours }), [siteName, defaultInviteHours]);
  return <SiteProfileContext.Provider value={value}>{children}</SiteProfileContext.Provider>;
}

export function useSiteProfile(): SiteProfileContextValue {
  return useContext(SiteProfileContext);
}

export function shortBrand(siteName: string): string {
  return siteName.split('·')[0]?.trim() || siteName.trim() || '墨界';
}

import { useQueryClient } from '@tanstack/react-query';
import type { MandateRailChoice } from './sipCopy';

/** What SIP-01 hands to SIP-03. It stays in memory (React Query cache), never in the URL. */
export interface SipDraft {
  amount: string;
  installmentDay: number;
  numberOfInstalments: number | null;
  /** The quote's expected first instalment, so SIP-03 can say when registration moved it. */
  quotedFirstInstalmentDate: string;
  /** F13: absent means UPI Autopay. */
  rail?: MandateRailChoice;
}

export function useSipDraft(schemeId: string) {
  const queryClient = useQueryClient();
  const key = ['sipDraft', schemeId] as const;
  return {
    read: (): SipDraft | null => queryClient.getQueryData<SipDraft>(key) ?? null,
    save: (draft: SipDraft): void => {
      queryClient.setQueryData<SipDraft>(key, draft);
    },
    clear: (): void => {
      queryClient.removeQueries({ queryKey: key });
    },
  };
}

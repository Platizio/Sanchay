// VERIFICATION STUB standing in for Plan 03 E13's CNF-01 sheet (same props).
import { AppText, Sheet } from '@sanchay/ui';

export interface ConsentOtpSheetProps {
  challengeId: string;
  onApproved(): void;
  onClose(): void;
}

export function ConsentOtpSheet({ challengeId, onClose }: ConsentOtpSheetProps) {
  return (
    <Sheet visible title="Confirm to continue" onClose={onClose}>
      <AppText>{challengeId}</AppText>
    </Sheet>
  );
}

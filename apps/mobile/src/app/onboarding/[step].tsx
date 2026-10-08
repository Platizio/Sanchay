import {
  AddressScreen,
  BankScreen,
  DeclarationsScreen,
  FatcaScreen,
  IdentityScreen,
  NomineesScreen,
  PersonalDetailsScreen,
  ProvisioningStatusScreen,
  ReviewAttestScreen,
  RiskQuestionnaireScreen,
} from '@sanchay/features';
import { useLocalSearchParams } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import type { ComponentType } from 'react';
import { NativeScreen } from '../../native/NativeScreen';

const STEP_SCREENS: Record<string, ComponentType> = {
  identity: IdentityScreen,
  personal: PersonalDetailsScreen,
  address: AddressScreen,
  fatca: FatcaScreen,
  bank: BankScreen,
  nominees: NomineesScreen,
  risk: RiskQuestionnaireScreen,
  declarations: DeclarationsScreen,
  review: ReviewAttestScreen,
  provisioning: ProvisioningStatusScreen,
};

export default function OnboardingStepRoute() {
  const { step } = useLocalSearchParams<{ step: string }>();
  // FLAG_SECURE while PAN/DOB (ONB-01), address/tax answers, the full bank account number (ONB-08)
  // or the CNF-01 attest sheet (ONB-16) are on screen (G-E6).
  usePreventScreenCapture(`onboarding-${step}`);
  const StepScreen = STEP_SCREENS[step] ?? IdentityScreen;
  return (
    <NativeScreen>
      <StepScreen />
    </NativeScreen>
  );
}

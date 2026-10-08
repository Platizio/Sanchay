import {
  AddressScreen,
  FatcaScreen,
  IdentityScreen,
  PersonalDetailsScreen,
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
};

export default function OnboardingStepRoute() {
  const { step } = useLocalSearchParams<{ step: string }>();
  // FLAG_SECURE while PAN/DOB (ONB-01) or address/tax answers are on screen (G-E6).
  usePreventScreenCapture(`onboarding-${step}`);
  const StepScreen = STEP_SCREENS[step] ?? IdentityScreen;
  return (
    <NativeScreen>
      <StepScreen />
    </NativeScreen>
  );
}

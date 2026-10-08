import { color, fontSize, radius, space } from '@sanchay/tokens';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';

export interface ProgressStep {
  key: string;
  label: string;
}

export type ProgressStepState = 'done' | 'active' | 'upcoming';

export interface ProgressStepsProps {
  steps: ProgressStep[];
  current: string;
  testID?: string | undefined;
}

export function ProgressSteps({ steps, current, testID }: ProgressStepsProps) {
  const currentIndex = steps.findIndex((step) => step.key === current);
  return (
    <View style={styles.list} {...(testID ? { testID } : {})}>
      {steps.map((step, index) => {
        const state: ProgressStepState =
          currentIndex === -1 || index === currentIndex
            ? index === currentIndex
              ? 'active'
              : 'upcoming'
            : index < currentIndex
              ? 'done'
              : 'upcoming';
        return (
          <View key={step.key} {...stepStateProps(state)} style={styles.row}>
            <View style={[styles.dot, dotStyleFor(state)]} />
            <AppText tone={state === 'upcoming' ? 'muted' : 'default'} style={styles.label}>
              {step.label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

/**
 * react-native-web turns `dataSet` into `data-*` DOM attributes (here `data-step-state`, which the tests
 * and web styling hook onto); RN's View type does not declare it and native ignores it.
 */
function stepStateProps(state: ProgressStepState): object {
  return { dataSet: { stepState: state } };
}

function dotStyleFor(state: ProgressStepState) {
  if (state === 'done') return styles.dotDone;
  if (state === 'active') return styles.dotActive;
  return styles.dotUpcoming;
}

const styles = StyleSheet.create({
  list: { gap: space(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  dot: { width: 12, height: 12, borderRadius: radius.pill },
  dotDone: { backgroundColor: color.gain },
  dotActive: { backgroundColor: color.primary },
  dotUpcoming: { backgroundColor: color.border },
  label: { fontSize: fontSize.md },
});

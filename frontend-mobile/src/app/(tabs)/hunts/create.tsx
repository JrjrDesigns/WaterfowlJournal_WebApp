import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { HuntForm } from '@/components/hunt-form';
import { ScreenHeader } from '@/components/screen-header';
import { colors } from '@/constants/theme';

/* Logging a hunt. The form itself is shared with the edit screen — see
 * components/hunt-form.tsx — because the two differ only in where the values
 * start and where they are saved. The web app keeps two near-identical 440-line
 * files and they have already drifted; one form cannot. */
export default function HuntCreate() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Log Hunt" onBack={() => router.back()} backLabel="Hunts" />
      <HuntForm
        mode="create"
        onSaved={() => router.back()}
        onCancel={() => router.back()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
});

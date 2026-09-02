import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { HuntForm } from '@/components/hunt-form';
import { ScreenHeader } from '@/components/screen-header';
import { colors } from '@/constants/theme';

/* Editing a logged hunt. Same form as Log Hunt, loaded with the hunt's current
 * values and saved back with PUT instead of POST. */
export default function HuntEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Edit Hunt" onBack={() => router.back()} backLabel="Hunt" />
      <HuntForm
        mode="edit"
        huntId={id}
        onSaved={() => router.back()}
        onCancel={() => router.back()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
});

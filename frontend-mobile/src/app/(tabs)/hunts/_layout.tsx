import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';

export default function HuntsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="edit" />
      {/* Logging a hunt is a task with an obvious end, so it gets a sheet the
          user can swipe away — same reasoning as the new-location screen. */}
      <Stack.Screen name="create" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

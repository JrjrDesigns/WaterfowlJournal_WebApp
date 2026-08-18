import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';

export default function LocationsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      {/* Creating a location is a task, not a place — a sheet that can be
          swiped away is the iOS idiom for that, and it keeps the list
          underneath visible as context. */}
      <Stack.Screen name="new" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

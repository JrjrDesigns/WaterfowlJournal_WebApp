import { Stack, useRouter } from 'expo-router';
import { TouchableOpacity, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography } from '../../../utils/theme';

export default function HuntsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.white,
        },
        headerShadowVisible: true,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen 
        name="create" 
        options={{ 
          title: 'New Hunt',
          headerTitleStyle: {
            fontFamily: 'American Typewriter',
            fontWeight: 'bold',
            fontSize: 20,
            color: colors.textPrimary,
          },
          headerLeft: () => {
            const router = useRouter();
            return (
              <TouchableOpacity 
                onPress={() => router.back()}
                style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center',
                  paddingLeft: 8,
                  paddingVertical: 8,
                  paddingRight: 8,
                  backgroundColor: 'transparent',
                }}
                activeOpacity={0.6}
              >
                <Ionicons name="chevron-back" size={28} color={colors.primary} />
                <Text style={{ 
                  fontSize: 17,
                  color: colors.primary,
                  marginLeft: -4,
                  backgroundColor: 'transparent',
                }}>
                  Hunts
                </Text>
              </TouchableOpacity>
            );
          },
        }} 
      />
      <Stack.Screen 
        name="[id]" 
        options={{ 
          title: 'Hunt Details',
          headerTitleStyle: {
            fontFamily: 'American Typewriter',
            fontWeight: 'bold',
            fontSize: 20,
            color: colors.textPrimary,
          },
          headerLeft: () => {
            const router = useRouter();
            return (
              <TouchableOpacity 
                onPress={() => router.back()}
                style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center',
                  paddingLeft: 8,
                  paddingVertical: 8,
                  paddingRight: 8,
                  backgroundColor: 'transparent',
                }}
                activeOpacity={0.6}
              >
                <Ionicons name="chevron-back" size={28} color={colors.primary} />
                <Text style={{ 
                  fontSize: 17,
                  color: colors.primary,
                  marginLeft: -4,
                  backgroundColor: 'transparent',
                }}>
                  Hunts
                </Text>
              </TouchableOpacity>
            );
          },
        }} 
      />
    </Stack>
  );
}

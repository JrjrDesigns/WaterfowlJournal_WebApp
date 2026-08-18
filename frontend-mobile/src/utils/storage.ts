import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/* Two stores, split by sensitivity.
 *
 * The auth token goes in the Keychain/Keystore via SecureStore — it is the
 * credential, and on a stolen phone AsyncStorage is a plain file. Everything
 * else (the cached user, offline hunt data) goes in AsyncStorage, which has no
 * size ceiling worth worrying about. SecureStore does, at 2KB per value.
 *
 * SecureStore has no web implementation, so the web target — used here only for
 * fast visual checks during development, never shipped — falls back to
 * localStorage. That is not a security regression because the web build is not
 * a product; app.blindguideapp.com is a separate codebase.
 */

const isWeb = Platform.OS === 'web';

export const secureGet = async (key: string): Promise<string | null> => {
  if (isWeb) return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
};

export const secureSet = async (key: string, value: string): Promise<void> => {
  if (isWeb) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
};

export const secureDelete = async (key: string): Promise<void> => {
  if (isWeb) {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
};

export const cacheGet = async (key: string): Promise<string | null> =>
  AsyncStorage.getItem(key);

export const cacheSet = async (key: string, value: string): Promise<void> =>
  AsyncStorage.setItem(key, value);

export const cacheDelete = async (key: string): Promise<void> =>
  AsyncStorage.removeItem(key);

export const TOKEN_KEY = 'token';
export const USER_KEY = 'user';

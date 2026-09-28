import * as SecureStore from 'expo-secure-store';
import type { SecureStoreLike } from '../lib/sessionStore';

// The token never leaves this device and is readable only while the device is unlocked.
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const secureStoreAdapter: SecureStoreLike = {
  getItemAsync: (key) => SecureStore.getItemAsync(key, options),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, options),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key, options),
};

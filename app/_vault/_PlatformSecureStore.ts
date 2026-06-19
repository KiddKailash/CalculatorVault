import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { SecureStoreLike } from './_SecureSession';

const webPrefix = 'vault.webstore.';

const webStore: SecureStoreLike = {
  async getItemAsync(key) {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(webPrefix + key);
  },
  async setItemAsync(key, value) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(webPrefix + key, value);
  },
  async deleteItemAsync(key) {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(webPrefix + key);
  },
};

const nativeStore: SecureStoreLike = {
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
};

const PlatformSecureStore: SecureStoreLike =
  Platform.OS === 'web' ? webStore : nativeStore;

export default PlatformSecureStore;

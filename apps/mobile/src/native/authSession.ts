import * as WebBrowser from 'expo-web-browser';
import { mandateReturnUrl } from '../lib/mandateReturn';
import { mobileConfig } from './config';

/** F13 eNACH: the bank page in a Custom Tab auth session (H-1); MandateScreen re-reads afterwards. */
export async function openMandateAuthSession(url: string): Promise<void> {
  await WebBrowser.openAuthSessionAsync(url, mandateReturnUrl(mobileConfig.appOrigin));
}

/**
 * H-1: Android returns land on the verified App Link `https://app.sanchay.in/app/r/{kind}`. The eNACH
 * auth session closes itself if the bank page ever redirects there; otherwise the investor closes it.
 */
export function mandateReturnUrl(appOrigin: string): string {
  return `${new URL(appOrigin).origin}/app/r/mandate`;
}

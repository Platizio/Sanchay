import { z } from 'zod';
import { SITE_PREFIX } from './routing';

/**
 * Must stay identical to ARN_REGEX in packages/domain/src/legal-entity.ts (C6, R-19), which dsc02
 * enforces. It is repeated here because C10 does not depend on C6. site-config.test.ts pins the
 * 9-digit limit, and C11's /site build fails if the two ever disagree.
 */
const ARN_PATTERN = /^ARN-\d{1,9}$/;

const schema = z.object({
  SANCHAY_PLATFORM_ARN: z.string().regex(ARN_PATTERN),
  SANCHAY_PLATFORM_ARN_VALID_TILL: z.iso.date(),
  SANCHAY_APP_ORIGIN: z.url().optional(),
  SANCHAY_WWW_ORIGIN: z.url().optional(),
});

export interface SiteConfig {
  platformArn: string;
  platformArnValidTill: string;
  appOrigin: string;
  wwwOrigin: string;
}

function unsetIfBlank(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

/** Throws when the ARN or its validity date is missing: the DSC-02 line on every www page needs both. */
export function readSiteConfig(env: Record<string, string | undefined> = process.env): SiteConfig {
  const parsed = schema.parse({
    SANCHAY_PLATFORM_ARN: env.SANCHAY_PLATFORM_ARN,
    SANCHAY_PLATFORM_ARN_VALID_TILL: env.SANCHAY_PLATFORM_ARN_VALID_TILL,
    SANCHAY_APP_ORIGIN: unsetIfBlank(env.SANCHAY_APP_ORIGIN),
    SANCHAY_WWW_ORIGIN: unsetIfBlank(env.SANCHAY_WWW_ORIGIN),
  });
  return {
    platformArn: parsed.SANCHAY_PLATFORM_ARN,
    platformArnValidTill: parsed.SANCHAY_PLATFORM_ARN_VALID_TILL,
    appOrigin: parsed.SANCHAY_APP_ORIGIN ?? '',
    wwwOrigin: parsed.SANCHAY_WWW_ORIGIN ?? '',
  };
}

/** Absolute www URL, or the /site path when the app runs on a single local host. */
export function wwwUrl(site: Pick<SiteConfig, 'wwwOrigin'>, path: string): string {
  return site.wwwOrigin ? `${site.wwwOrigin}${path}` : `${SITE_PREFIX}${path}`;
}

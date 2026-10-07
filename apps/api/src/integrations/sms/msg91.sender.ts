import {
  SenderUnavailableError,
  type SendResult,
  type SmsMessage,
  type SmsSender,
} from './port.js';
import { SMS_TEMPLATE_IDS } from './templates.js';

type Msg91TemplateKey = keyof typeof SMS_TEMPLATE_IDS;

export interface Msg91Credentials {
  authKey: string;
  senderId: string;
  peId: string;
  templateIds: Record<Msg91TemplateKey, string>;
}

export type Msg91Fetch = (url: string, init: RequestInit) => Promise<Response>;
const defaultFetch: Msg91Fetch = (url, init) => fetch(url, init);

/** Our internal SMS_TEMPLATE_IDS value (e.g. 'SANCHAY_LOGIN_OTP_V1') -> the R-10 flow key it belongs to. */
const FLOW_KEY_BY_INTERNAL_ID: ReadonlyMap<string, Msg91TemplateKey> = new Map(
  (Object.entries(SMS_TEMPLATE_IDS) as [Msg91TemplateKey, string][]).map(([key, internalId]) => [
    internalId,
    key,
  ]),
);

/** MSG91 Flow API (control.msg91.com/api/v5/flow), one DLT-approved flow per SMS_TEMPLATE_IDS key. */
export class Msg91SmsSender implements SmsSender {
  constructor(
    private readonly credentials: Msg91Credentials,
    private readonly fetchImpl: Msg91Fetch = defaultFetch,
  ) {}

  async send(message: SmsMessage): Promise<SendResult> {
    const flowKey = FLOW_KEY_BY_INTERNAL_ID.get(message.templateId);
    if (flowKey === undefined) {
      throw new SenderUnavailableError(
        `msg91: no DLT flow id configured for template ${message.templateId}`,
      );
    }
    const flowId = this.credentials.templateIds[flowKey];
    let res: Response;
    try {
      res = await this.fetchImpl('https://control.msg91.com/api/v5/flow/', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authkey: this.credentials.authKey },
        body: JSON.stringify({
          flow_id: flowId,
          sender: this.credentials.senderId,
          mobiles: `91${message.to}`,
          short_url: '0',
          PE_ID: this.credentials.peId,
          TEMPLATE_ID: flowId,
          VAR_BODY: message.text,
        }),
      });
    } catch (cause) {
      // MF-2: keep only the error name (timeout, network); a raw cause may carry the request URL or body.
      const name = (cause as { name?: string } | null)?.name;
      throw new SenderUnavailableError(
        name === undefined ? 'msg91: request failed' : `msg91: request failed (${name})`,
      );
    }
    if (!res.ok) throw new SenderUnavailableError(`msg91: HTTP ${res.status}`);
    const body = (await res.json()) as { type?: string; message?: string };
    if (body.type === 'error') {
      // MF-2: the provider's free text may echo the mobile number; a fixed message only.
      throw new SenderUnavailableError('msg91: provider error');
    }
    return { provider: 'MSG91', messageId: body.message ?? '' };
  }
}

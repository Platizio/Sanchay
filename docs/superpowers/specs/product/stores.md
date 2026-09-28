<!-- source: workflow wf_3190e72a-04a label spec:stores | exported 2026-09-28 -->

# Sanchay: native app store and mobile security compliance (store checklist and Expo control list)

Plan-mode deliverable. Nothing was created or changed. Sources were accessed on 2026-09-25 unless a different date is given. v1 code is cited as `path:line`.

---

## 0. Decisions at a glance

| # | Decision | Why |
|---|---|---|
| D1 | **Both store accounts must be Platizio's organisation accounts** (the entity that holds the ARN). No individual account and no agency account. You need a D-U-N-S number, and the seller/developer name must match Platizio's legal name. | Apple 3.2.1(viii) and 5.1.1(ix): investing apps must be "submitted by the financial institution performing such services" / "by a legal entity". Google Play says to use an organisation account for "financial products and services… investment funds". |
| D2 | **Distribute in India only** on both stores at launch. | Platizio's licences only cover India (Apple 3.2.1(viii) "…licensing… in the locations where you make them available"). This also keeps the app out of the EU DSA trader-status requirement. |
| D3 | **No social login at launch.** Use the platform's own mobile/email OTP login. As a result, **Sign in with Apple is not required.** | Apple 4.8 exempts apps that "exclusively use your company's own account setup and sign-in systems". If Google Sign-In is ever added, Sign in with Apple becomes mandatory. |
| D4 | **No tracking.** No IDFA/AAID, no ad SDKs, no ATT prompt, AD_ID permission blocked, and every privacy label marked "Tracking: No". | Keeps Apple 5.1.2(i) and Play's Advertising ID declaration simple, and fits the low-end-Android performance goal. |
| D5 | **In-app "Delete account" on both platforms, plus a web deletion URL.** It runs as a staged closure: a 7-day reversal window, then non-regulatory data is purged within 30 days and regulated records go into a restricted retention vault for **8 years from closure** (§4). | This satisfies Apple 5.1.1(v), Play's deletion policy, and the retention duties under PMLA s.12, AMFI record-keeping and DPDP s.12(3). |
| D6 | **Expo SDK 57 (RN 0.86) with a dev build (expo-dev-client) only.** Expo Go is not a supported runtime for Sanchay. | Almost every security control below needs a config plugin or native code. Android push has not worked in Expo Go since SDK 53, and Face ID needs a dev build. |
| D7 | Screen-capture blocking is applied **per sensitive screen**, and the app-switcher/recents snapshot is hidden **app-wide**. | This balances protecting PII against mass-market users who screenshot things to ask for help. |
| D8 | Device integrity comes mainly from **server-verified Play Integrity / App Attest** (`@expo/app-integrity`, starting in monitor mode). Client-side RASP (**freeRASP**) is a second signal. Rooted devices are **warned and stepped up, not hard-blocked**. | The package is in alpha, and hard-blocking wrongly flagged low-end Android devices would hurt adoption. |
| D9 | **Pin certificates at the CA level** (Amazon Trust Services roots plus one backup CA) with `react-native-ssl-public-key-pinning`, initialised from JS so pins can be rotated over the air. | Pinning ACM leaf certificates risks locking users out when certificates auto-renew. |
| D10 | Push notifications are **generic by default** (no amounts, fund names, PAN, folio or OTP). Android channels use private lockscreen visibility. Marketing push is a separate opt-in. | Apple 4.5.4, and to limit personal data passing through FCM/APNs. |
| D11 | Crash reporting uses **Sentry in the EU region** with `sendDefaultPii:false`, scrubbing in `beforeSend`/`beforeBreadcrumb`, server-side scrubbing, and **no screenshots, view hierarchy or Session Replay**. | Neither Sentry region is in India. So only scrubbed, non-PII diagnostics leave India (fallback: self-hosted in ap-south-1). |
| D12 | **EAS Update with end-to-end code signing**, `runtimeVersion: fingerprint`, and staged rollouts. OTA is for JS fixes, copy and compliance text only. New regulated features ship as store builds. | Apple DPLA 3.3.1(B), Play Device & Network Abuse policy, and Apple 2.3.1(a) ("no hidden features"). |

---

## 1. Assumptions

| # | Assumption | Impact if wrong |
|---|---|---|
| A1 | The consumer domain is `sanchay.in` (used for universal/app links, the deletion URL and domain-bound OTPs). | Replace it everywhere. The design doesn't change. |
| A2 | Platizio Pvt Ltd is the legal entity, holds the ARN, and will own both developer accounts, the D-U-N-S number and the privacy policy. | If a group company publishes the app instead, it must be the ARN holder, or Apple 3.2.1(viii) is at risk. |
| A3 | KYC, eSign, DigiLocker, IPV and netbanking/UPI payment pages are hosted by Cybrilla FP, the KRAs or the payment gateway, and open in **system browser tabs** (`expo-web-browser`: Custom Tabs / SFSafariViewController), not in a WebView. | If they are embedded in a WebView, the app needs CAMERA/RECORD_AUDIO permissions and a WebView permission bridge, and the data-safety labels grow. |
| A4 | SEBI's MF 2FA OTP for subscriptions and redemptions is sent by FP/AMC/RTA in their own SMS format. Login OTPs are sent by Sanchay through MSG91, and Sanchay controls that DLT template. | This decides which autofill API applies to which OTP (§5.6). |
| A5 | Minimum OS: Android API 24 (Expo/RN default) and iOS 16.4 (Expo SDK 57 minimum). | Low-end Android coverage. |
| A6 | Retention of 8 years from closure (or from the last transaction, whichever is later) is the harmonised period. It is the longest known obligation that applies. | The compliance officer may lengthen it, but should not shorten it below PMLA's 5 years. |
| A7 | Sanchay is not a SEBI-registered stockbroker. It is therefore **not eligible** for Google Play's "SEBI-verified" badge, which requires SEBI broker/PMS registration and listing in an exchange app registry. | Store copy must not imply SEBI endorsement. |

---

## 2. Policy fact base (official sources)

| Topic | Fact | Source |
|---|---|---|
| Play: organisation account | Choose an organisation account if you provide "financial products and services, including… stock trading, investment funds". A D-U-N-S number is required. | https://support.google.com/googleplay/android-developer/answer/13634885 ; https://support.google.com/googleplay/android-developer/answer/13628312 |
| Play: 12-testers/14-days rule | Applies only to **personal** accounts created after 2023-11-13. Organisation accounts are exempt. | https://support.google.com/googleplay/android-developer/answer/14151465 |
| Play: Financial features declaration | Mandatory for every app on any track. The categories include "Stock trading and portfolio management", "Financial advice" and "Mobile payments and digital wallets". | https://support.google.com/googleplay/android-developer/answer/13849271 |
| Play: India, SEBI | Apps must comply with SEBI rules. The "SEBI-verified" badge needs SEBI broker/PMS registration, a listing in an exchange mobile-app registry, and a Play Console entity name that matches regulatory filings. Apps must not "misrepresent or misuse registration identifiers" or "imply government or regulatory endorsement". The badge launched on 2026-03-25. | https://support.google.com/googleplay/android-developer/answer/6223646 ; SEBI PR 2026-03-25 https://www.sebi.gov.in/media-and-notifications/press-releases/mar-2026/…_100616.html |
| Play: Financial Services policy | India-specific licensing text covers personal loans (the RBI DLA list) only. Nothing is MF-specific beyond general law compliance. | https://support.google.com/googleplay/android-developer/answer/9876821 |
| Play: account deletion | Requires an in-app path that is "prominent (for example, within the account settings)" **and** a web link resource. Everything declared in Data safety is in scope. Data may be kept "for legitimate reasons such as security, fraud prevention or regulatory compliance" if you "clearly inform users about your data retention practices". | https://support.google.com/googleplay/android-developer/answer/13327111 |
| Play: Data safety | Transfers to service providers, for legal purposes, or initiated by the user are not "sharing". Ephemeral processing is exempt. The optional MASA independent security review badge exists. | https://support.google.com/googleplay/android-developer/answer/10787469 |
| Play: target API | From 2026-08-31, new apps and updates must target **API 36** (extension possible to 2026-11-01). Existing apps must target ≥35 to stay visible to new users. | https://support.google.com/googleplay/android-developer/answer/11926878 |
| Play: 16 KB page size | Since 2025-11-01, new apps and updates that target ≥35 and contain native code must support 16 KB pages. | https://android-developers.googleblog.com/2025/05/prepare-play-apps-for-devices-with-16kb-page-size.html ; https://developer.android.com/guide/practices/page-sizes |
| Play: SMS permissions | READ/RECEIVE_SMS are allowed only for default handlers or listed exceptions. Use the SMS Retriever API or SMS User Consent instead. The Call-Log verification exception ends on 2027-01-27. | https://support.google.com/googleplay/android-developer/answer/10208820 ; https://developers.google.com/identity/sms-retriever/verify |
| Play: Photo/Video | READ_MEDIA_IMAGES/VIDEO are restricted. Apps with one-time use must use the system photo picker. | https://support.google.com/googleplay/android-developer/answer/14115180 |
| Play: code download | Apps may not download dex/JAR/.so from outside Play. Code running in a VM/interpreter with indirect API access (JavaScript) is excepted. | https://support.google.com/googleplay/android-developer/answer/16559646 |
| Play: AD_ID | Apps that target 13+ and use the advertising ID must declare it. SDKs can merge the permission in. Remove it explicitly. | https://support.google.com/googleplay/android-developer/answer/6048248 |
| Android developer verification | Enforced from Sept 2026 in BR/ID/SG/TH. **India follows in 2027.** | https://support.google.com/android-developer-console/answer/16561738 ; https://thehackernews.com/2026/06/google-sets-sept-30-deadline-for.html |
| Apple 3.2.1(viii) | "Apps used for financial trading, investing, or money management should be submitted by the financial institution performing such services and must have necessary licensing and permissions in the locations where you make them available." | https://developer.apple.com/app-store/review/guidelines/ |
| Apple 5.1.1(ix) | Highly regulated fields, including "banking and financial services", "should be submitted by a legal entity… not by an individual developer." | same |
| Apple 5.1.1(v) | "If your app supports account creation, you must also offer account deletion within the app." | same |
| Apple deletion guidance | Delete "the entire account record, along with associated personal data". Regulated industries "may use additional customer service flows to confirm and facilitate" deletion. Manual or slow processes are fine if you "inform the user how long it will take… and provide a confirmation". Identity checks are allowed. Retain data where legally required. | https://developer.apple.com/support/offering-account-deletion-in-your-app/ |
| Apple 4.8 | Sign in with Apple (or an equivalent) is required only if third-party/social login is used for the primary account. Exemption: "exclusively uses your company's own account setup and sign-in systems". | review guidelines |
| Apple 4.5.4 | Push "should not be used to send sensitive personal or confidential information". Promotional push needs an explicit in-app opt-in and an opt-out. | review guidelines |
| Apple 5.1.1(i)/(ii), 5.1.2(i) | A privacy-policy link is required both in-app and in ASC, and it must explain retention and deletion. Consent is needed for collection. Tracking requires ATT. The app may not force users to enable push. | review guidelines |
| Apple 2.1(a) | Include demo account info and keep the backend running. | review guidelines |
| Apple 2.3.1(a) | No hidden or undocumented features. New features must be described "with specificity" in Review Notes. | review guidelines |
| Apple 2.5.2 and DPLA 3.3.1(B) | Apps may not download code that changes features. Interpreted code is allowed if it doesn't change the app's primary purpose, bypass OS security, or create a storefront. | review guidelines; https://developer.apple.com/support/terms/apple-developer-program-license-agreement/ |
| Apple privacy labels | Financial Info = Payment Info / Credit Info / Other Financial Info. The regulated-financial-services optional-disclosure carve-out applies **only** where collection is "not part of your app's primary functionality" and is optional. That doesn't fit Sanchay, so disclose everything. | https://developer.apple.com/app-store/app-privacy-details/ |
| Apple privacy manifests | `PrivacyInfo.xcprivacy` with required-reason APIs is mandatory, as are signatures for listed binary SDKs. | https://developer.apple.com/documentation/bundleresources/privacy-manifest-files ; https://developer.apple.com/news/?id=pvszzano |
| Apple SDK minimum | Since 2026-04-28, uploads must be built with Xcode 26 / the iOS 26 SDK. | https://developer.apple.com/news/upcoming-requirements/ |
| Apple age ratings | New 13+/16+/18+ tiers. The questionnaire has been mandatory since 2026-01-31. A higher rating than computed can be set. | https://developer.apple.com/news/?id=ks775ehf |
| SEBI MF 2FA | Online subscriptions (from 2023-04-01) and redemptions (from 2022-06-01) need 2FA. One factor is an OTP sent to the email/phone registered with the AMC/RTA. | https://www.sebi.gov.in/legal/circulars/mar-2022/…_57471.html ; SEBI circular of 2022-09-30 (via taxguru) |
| AMFI MFD Master Circular (AMFI/MFD-CIR/32/2025-26, 2026-01-14) | §1.3.6: show the name, the tagline "AMFI-registered Mutual Fund Distributor" and the ARN "in all forms of communication i.e. website, mobile app…". Code of Conduct 2(g): purge data "as soon as the data is no longer required". 3(b): cyber-security for digital platforms. 3(d): keep KYC records and suitability/consent correspondence. 4(f): the digital platform must disclose "Regular Plan which involves payment of commission", the commission-rate link and the SID/SAI/KIM link. 4(g): no indicative or assured returns. §5.2.4: execution-only EUIN declaration. The DSC declaration form must be "stored… for a period of at least 8 years". | https://www.amfiindia.com/uploads/AMFI_Master_Cicular_for_MF_Ds_3c7f5ee44f.pdf (pp. 18, 33–34, 37, 59) |
| PMLA s.12 / SEBI AML Master Circular (2024-06-06) | Records must be kept ≥5 years from the transaction or until investigations conclude. Identity records must be kept 5 years after the relationship ends. | https://www.sebi.gov.in/sebi_data/attachdocs/jul-2018/1530683670247.pdf ; https://taxguru.in/sebi/sebi-guidelines-aml-cft-standards-obligations-pmla-2002.html |
| DPDP Rules 2025 | Notified 2025-11-13. Substantive obligations apply from **2027-05-13**. Rule 8: erase once the purpose is served, and keep processing logs ≥1 year. Act s.12(3): erasure applies unless retention is needed for the purpose or to comply with law. | https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf |
| CERT-In Directions (2022-04-28) | Keep ICT logs for 180 days **within India**. Report incidents within 6 hours. Applies to bodies corporate. | https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf |
| Expo | SDK 57 = RN 0.86. Build-properties targetSdk 36 / compileSdk 37 / iOS deployment target 16.4. | https://expo.dev/changelog/sdk-57 ; https://docs.expo.dev/versions/latest/sdk/build-properties/ |

---

## 3. Store submission checklist

Priority key: **P0** = blocks the first internal/closed-track submission. **P1** = blocks public production launch. **P2** = within 2 sprints after launch.

### 3.1 Organisational prerequisites (both stores)

| ✔ | Item | Owner | P |
|---|---|---|---|
| ☐ | D-U-N-S number for Platizio. Its legal name and address must exactly match the MCA/GST records and the AMFI ARN certificate. | Founder/Compliance | P0 |
| ☐ | A shared, role-based email alias (e.g. `appstores@platizio…`) owns both accounts. Hardware-key 2FA on the Google account and the Apple ID. | Eng | P0 |
| ☐ | Privacy policy at `https://sanchay.in/privacy`. It covers every data type in §3.5, the sub-processors (Cybrilla, KRAs/CKYC, AMCs/RTAs, MSG91, Sentry, Expo, Google FCM, Apple APNs, Talsec), the retention schedule (§4.2), the deletion process and URL, how to withdraw consent, the grievance officer, and DPDP rights. | Compliance | P0 |
| ☐ | Terms of use, commission disclosure page (AMFI 4(f)), and the page linking SID/SAI/KIM. | Compliance | P0 |
| ☐ | Web deletion resource `https://sanchay.in/account/delete`: OTP-authenticated, names "Sanchay by Platizio", explains retention. | Eng | P0 |
| ☐ | Support URL/email and grievance escalation (SEBI SCORES / AMFI) published. | Ops | P0 |
| ☐ | Store listing text and screenshots reviewed against AMFI 1.3.6/4(f)/4(g). Must include the name, "AMFI-registered Mutual Fund Distributor", the ARN, "Regular plans" and the MF risk disclaimer. Must not include "advisor", "guaranteed/assured returns", or any implied SEBI endorsement. | Compliance | P0 |

### 3.2 Google Play

| ✔ | Area | Item and concrete value | P |
|---|---|---|---|
| ☐ | Account | **Organisation** developer account, D-U-N-S verified. Developer name = Platizio legal name. No 12-tester requirement applies. | P0 |
| ☐ | App | Package `in.sanchay.app`. **Play App Signing** enabled. Upload key held in EAS credentials, with an offline backup. | P0 |
| ☐ | Target/SDK | `targetSdkVersion 36` (SDK 57 default). Verify every native lib (freeRASP, pinning, Sentry, Hermes) is 16 KB page aligned. Check the Play Console "App bundle explorer → Memory page size" warning. | P0 |
| ☐ | Countries | India only. | P0 |
| ☐ | Financial features declaration | Select **"Stock trading and portfolio management"**. It is the only investing category, and the app holds, displays and manages MF portfolios. Describe it as "Mutual fund distribution (Regular plans) by AMFI-registered MFD, ARN-xxxx; orders executed via AMCs/RTAs". **Don't** select "Mobile payments and digital wallets": payments go through the gateway/UPI apps and Sanchay holds no funds. **Don't** select "Financial advice" (execution-only, no recommendations). Re-declare if a recommendations/model-portfolio feature ships. | P0 |
| ☐ | SEBI-verified badge | Not eligible (A7). Don't request it or claim it. | — |
| ☐ | Data safety | Fill it in per §3.5. Answer "Yes: users can request data deletion" and give the web URL. Answer "Encrypted in transit: Yes". | P0 |
| ☐ | Data deletion questions | In-app path (Profile → Settings → Account & data → **Delete account**), the web URL, and "partial deletion supported" (external CAS holdings, marketing prefs, devices). | P0 |
| ☐ | App access | Reviewer instructions for the demo account (§3.4). | P0 |
| ☐ | Ads | "No ads". | P0 |
| ☐ | Advertising ID declaration | "No, does not use advertising ID". AD_ID is blocked in the manifest (§6). | P0 |
| ☐ | Content rating (IARC) | Finance app, no UGC, no gambling. Expect "Everyone / 3+". Set the in-app 18+ gate through KYC. | P0 |
| ☐ | Target audience | 18+ only, "not designed to appeal to children". The Families policy does not apply. | P0 |
| ☐ | Sensitive permissions | Target **zero** restricted permissions: no SMS, Call Log, READ_MEDIA_*, location, contacts, QUERY_ALL_PACKAGES, or SYSTEM_ALERT_WINDOW in release. | P0 |
| ☐ | Store listing | Title "Sanchay: Mutual Funds & SIP". The short description has no return claims. The full description ends with the Platizio name + tagline + ARN + the "Mutual Fund investments are subject to market risks, read all scheme related documents carefully." disclaimer. Screenshots show real flows. | P1 |
| ☐ | Privacy policy | URL in Console **and** reachable in-app without login (Settings → Legal). | P0 |
| ☐ | Pre-launch report | Run it on the closed track. Fix accessibility and crash findings. Note that FLAG_SECURE screens appear black in the report, which is expected. | P1 |
| ☐ | Independent security review (MASA) | Optional badge. Schedule a MASVS L1 assessment after launch. | P2 |
| ☐ | Android developer verification (India, 2027) | Play-distributed builds are covered by the verified Play account. **Register the package** in the Android Developer Console before India enforcement if EAS internal APKs are sideloaded to testers. | P2 |

### 3.3 Apple App Store

| ✔ | Area | Item and concrete value | P |
|---|---|---|---|
| ☐ | Account | Apple Developer Program as an **Organization** (Platizio, D-U-N-S). Seller name = Platizio legal name. Account Holder = a Platizio director. EAS gets an **App Manager**-level API key (ASC API key), not the Account Holder's credentials. | P0 |
| ☐ | Bundle | `in.sanchay.app`. Capabilities: Push Notifications, Associated Domains (`applinks:sanchay.in`, `webcredentials:sanchay.in`), **App Attest**. | P0 |
| ☐ | Build | Xcode 26 / iOS 26 SDK (EAS image). Deployment target 16.4. | P0 |
| ☐ | Export compliance | `ITSAppUsesNonExemptEncryption = false`, set with Expo `ios.config.usesNonExemptEncryption: false`. The app uses only OS-provided TLS and Keychain. | P0 |
| ☐ | Privacy manifest | App-level `ios.privacyManifests`: `NSPrivacyTracking: false`, no tracking domains. Include required-reason entries for APIs used by RN/Expo (UserDefaults CA92.1, FileTimestamp C617.1, SystemBootTime 35F9.1, DiskSpace E174.1), then check the result against Xcode's "Generate Privacy Report" on the archive. Every SDK in Apple's commonly-used list must ship its own manifest and signature. | P0 |
| ☐ | App Privacy (nutrition label) | Per §3.5. "Data used to track you": **none**. | P0 |
| ☐ | ATT | Not implemented. No `NSUserTrackingUsageDescription`. | P0 |
| ☐ | Sign in with Apple | Not required (D3). Record the 4.8 exemption rationale in Review Notes. | P0 |
| ☐ | Account deletion | In-app "Delete account" (§4.4). Review Notes explain the regulated-industry confirmation step and the retention disclosure. | P0 |
| ☐ | Age rating | Answer the new questionnaire. Then **set 18+ manually** (the account opens only after KYC as an adult). | P0 |
| ☐ | Availability | India storefront only. | P0 |
| ☐ | Payments | No In-App Purchase. MF purchases are real-world financial services paid through gateway/UPI (guidelines 3.1.3(e) "goods and services outside of the app"). If a paid feature such as premium analytics is ever sold, IAP applies. | P0 |
| ☐ | Purpose strings | Only `NSFaceIDUsageDescription` ("Use Face ID to unlock Sanchay"). With A3, no camera/photos/location strings are needed. If CAS upload uses the document picker, no string is needed either. | P0 |
| ☐ | Review Notes | Demo credentials, the static-OTP explanation, the fact that orders route to a sandbox for the reviewer account (§3.4), the licence evidence (ARN certificate PDF link), the account-deletion path, and why screenshots are blocked on some screens. | P0 |
| ☐ | Metadata | Name "Sanchay: Mutual Funds & SIP". Subtitle with no return claims. Description ends with the AMFI tagline, the ARN and the disclaimer. Screenshots follow 2.3.3 and 2.3.8 (4+ appropriate). Privacy policy URL and support URL. | P1 |
| ☐ | Push | Promotional push only after a separate in-app opt-in, with opt-out in Settings (4.5.4). Push is never required to use the app (5.1.2(i)). | P1 |

### 3.4 Reviewer / demo access (both stores)

| Item | Recommendation |
|---|---|
| Account | One **reviewer account per store**, flagged server-side `review_account=true`. It has an allowlisted mobile number and email and a **static OTP for that account only**. |
| Guard rails | This lesson comes from v1: it had a global dev master-code bypass (`investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/OtpService.java:101`, `…/config/BypassCodeStartupGuard.java:22,57`) and a demo SMS stub accepting `000000` (`…/service/SmsOtpService.java:27,39,88,111`; `…/controller/InvestorAuthController.java:75`). In v2 the static OTP must be (a) bound to exact identifiers stored in DB config, not env; (b) usable only for `LOGIN` and FP-sandbox consent purposes; (c) audited on every use; and (d) paired with a startup assertion that refuses to boot if the reviewer-OTP table references any non-review account. |
| Data | The reviewer account is pre-KYC'd against **Cybrilla FP sandbox**, with seeded holdings, SIPs and a mandate so every launch flow can be exercised. Its orders go to the sandbox tenant and never touch real AMCs. |
| Disclosure | State the sandbox routing in Review Notes (Apple 2.3.1(a)) and in Play "App access". A reviewer outside India can't complete Aadhaar or DigiLocker, so the onboarding flow is shown with recorded steps. Attach a short screen recording of real onboarding (made on an internal build with FLAG_SECURE temporarily disabled). |

### 3.5 Data disclosures

**Google Play Data safety.** "Shared" is declared **conservatively as Yes** for identity and financial data, because AMCs/RTAs/KRAs act as independent controllers, not as Platizio's service providers.

| Play data type | Examples in Sanchay | Collected | Shared | Optional? | Purposes |
|---|---|---|---|---|---|
| Personal info → Name, Email, Phone, Address | Investor, nominee, guardian | Yes | Yes (Cybrilla/KRA/AMC/RTA) | Required | App functionality, Account management, Fraud prevention/security/compliance |
| Personal info → Other info | PAN, DOB, gender, occupation, income slab, FATCA/tax residency, masked Aadhaar reference | Yes | Yes | Required | same |
| Personal info → User IDs | Sanchay user ID, FP investor ID | Yes | Yes | Required | App functionality, Account management |
| Financial info → User payment info | Bank account number/IFSC, mandate reference | Yes | Yes | Required | App functionality, Compliance |
| Financial info → Purchase history | Orders, SIPs, redemptions | Yes | Yes | Required | App functionality |
| Financial info → Other financial info | Holdings, XIRR, CAS-imported external holdings | Yes | Yes (internal holdings) | Required (CAS is optional) | App functionality |
| Photos and videos → Photos | KYC documents/selfie (hosted flow, A3) | Yes (conservative) | Yes | Required for new KYC | Compliance |
| Files and docs | CAS PDF upload | Yes | No | Optional | App functionality |
| App activity → App interactions | First-party product analytics | Yes | No | Optional (consent) | Analytics |
| App info & performance → Crash logs, Diagnostics | Sentry | Yes | No (processor) | Required | App functionality/Analytics |
| Device or other IDs | Push token, install ID, integrity key ID | Yes | No | Required | Fraud prevention/security, App functionality |
| Location, Contacts, Messages, Audio, Health, Calendar, Web history | — | **No** | — | — | — |

Notes: OTP SMS read through SMS Retriever / User Consent is processed ephemerally on-device, so it is not declared. Biometrics never leave the device, so they are not declared. freeRASP telemetry to Talsec is device-security data: declare it as Device IDs / Diagnostics, with purpose "Fraud prevention, security".

**Apple App Privacy.** All items are "Linked to you" and none are used for tracking.

| Apple category → type | Purposes |
|---|---|
| Contact Info → Name, Email, Phone, Physical Address | App Functionality |
| Financial Info → **Payment Info** (bank account stored, so the gateway carve-out doesn't apply) and **Other Financial Info** (holdings, income slab, transactions) | App Functionality |
| Identifiers → User ID, Device ID (IDFV/install ID for device binding) | App Functionality |
| User Content → Photos or Videos (KYC), Other User Content (CAS PDF), Customer Support | App Functionality |
| Usage Data → Product Interaction | Analytics |
| Diagnostics → Crash Data, Performance Data | App Functionality |
| Other Data → PAN, DOB, FATCA, nominee details | App Functionality |
| Sensitive Info | **Not collected.** Face ID is local, and liveness runs in the provider's hosted flow. If Cybrilla/KRA IPV returns face-match scores to Platizio, add "Sensitive Info (biometric)". |

### 3.6 Compliance calendar (as of 2026-09-25)

| Date | Event | Action |
|---|---|---|
| Already in force | Play: target API 36 (since 2026-08-31). Apple: Xcode 26 SDK (since 2026-04-28). Apple age questionnaire. Play 16 KB pages. | Built into Expo SDK 57 and the EAS images. |
| 2026-11-13 | DPDP Phase II (consent managers). | Consent ledger ready (§4.5). |
| 2027-01-27 | Play ends the Call-Log account-verification exception. | Not applicable, since no call-log use. |
| 2027 (India) | Android developer verification enforcement. | Register packages for any sideloaded builds. |
| 2027-05-13 | DPDP Phase III: substantive obligations. | Retention/erasure engine and 72-hour breach flow must already be live (they are part of launch scope anyway). |
| ~Apr 2027 / ~Aug 2027 (projected from the annual cadence) | Next Apple SDK floor (Xcode 27). Next Play target (API 37). | Plan an Expo SDK upgrade per half-year. |

---

## 4. In-app account deletion vs SEBI/PMLA/AMFI retention

### 4.1 Obligation matrix

| Obligation | Requirement | How Sanchay meets it |
|---|---|---|
| Apple 5.1.1(v) + deletion guidance | Deletion is initiated in-app. Regulated apps may add confirmation steps. Tell users the timeline and confirm completion. Legal retention is allowed. | "Delete account" in Settings. OTP step-up. Timeline shown: 7-day reversal window, then completion ≤30 days. Confirmation email/SMS on completion. |
| Play deletion policy | In-app path plus web link. Retention for regulatory compliance must be disclosed. | Same flow on web at `/account/delete`. Retention table in the privacy policy and on the confirmation screen. |
| DPDP s.12(3), Rule 8 | Erase once the purpose is served, unless the law requires retention. Keep logs ≥1 year. | Data-class-driven purge (§4.2). The retention vault holds only what the law requires. |
| PMLA s.12 / SEBI AML Master Circular | Transaction and identity records ≥5 years after the transaction or the end of the relationship. | Vault retention of 8 years (A6). |
| AMFI MFD Master Circular 3(d) and 2(g) | Keep KYC records and suitability/consent correspondence. Purge data no longer needed. | Consents and EUIN/execution-only declarations are retained. Everything else is purged. |
| CERT-In 2022 | ICT logs 180 days, stored in India. | Infra/app logs kept 1 year in ap-south-1 (satisfies both). |

### 4.2 Data classification and retention schedule

| Class | Data | On deletion | Retention |
|---|---|---|---|
| R1: Regulated identity | KYC status/refs, PAN, name, DOB, address, FATCA/CRS self-cert, nominee/opt-out declaration, eSign/T&C acceptance artefacts, bank account plus penny-drop result | Move to **retention vault** (separate schema, encrypted columns, compliance-role-only access). Remove from the operational schema. | 8 years from closure → then hard delete |
| R2: Regulated transactions | Orders, payments, SIP/STP/SWP registrations, mandates, redemptions, allotments, FP IDs, 2FA consent records, EUIN / execution-only declaration, capital-gains snapshot | Vault | 8 years from the last transaction or closure, whichever is later |
| R3: Regulated correspondence | Support tickets, notification/email/SMS delivery log (template ID and timestamp, not the full body where avoidable) | Vault | 8 years |
| R4: Consent ledger | Marketing/analytics/data-processing consents and withdrawals | Vault | 8 years (proof of consent under DPDP) |
| S1: Security logs | Auth events, device integrity verdicts, admin-access audit | Stay in the log store | 1 year (CERT-In 180 days in India + DPDP Rule 8) |
| N1: Non-regulatory profile | Preferences, watchlists, goal settings, UI state | **Hard delete** | ≤30 days |
| N2: External holdings | CAS-imported non-Sanchay folios and parsed data. The raw PDF is already deleted right after parsing. | **Hard delete** | ≤30 days |
| N3: Device | Push tokens, device registrations, App Attest/Play Integrity key IDs, refresh tokens | Hard delete **immediately** at execution | 0 |
| N4: Analytics | First-party events | Delete by user ID | ≤30 days |
| N5: Diagnostics | Sentry events (no PII by design) | Age out | Sentry retention of 90 days, no action needed |
| B: Backups | RDS snapshots/PITR | Age out, never restored into production without re-applying deletions (a tombstone table is replayed on restore) | 35 days |
| External (not deletable by Platizio) | KRA/CKYC records, AMC/RTA folios, Cybrilla FP records | Tell the user. Send FP a deactivation/erasure request for non-regulated data. | Governed by those entities |

### 4.3 Deletion flow (state machine)

```
ACTIVE
  └─(user taps Delete account → OTP to registered mobile + email)→ PRECHECK
PRECHECK
  ├─ in-flight orders (payment pending / submitted / redemption payout pending) → BLOCKED_PENDING
  │     (show list + ETA; auto-notify when clear)
  ├─ active SIP/STP/SWP registrations or mandates → offer "Cancel all & continue"
  │     → FP cancellations + mandate revocation; wait for confirmations
  └─ clear → CONFIRM
CONFIRM (screen: what is deleted / what is retained 8y and why / holdings remain in
        your folios with AMCs — access via AMC/RTA/MF Central / trail commission on
        existing holdings continues to ARN unless you change distributor with the AMC /
        "Download statements first" CTA)
  └─(type DELETE + final OTP)→ PENDING_DELETION (T0)
PENDING_DELETION (7 days)
  ├─ sessions revoked immediately, login allowed only to "Cancel deletion"
  ├─ new orders/SIPs blocked
  └─(T0+7d job)→ EXECUTING
EXECUTING
  N3 hard-delete → N1/N2/N4 hard-delete → R1–R4 move to vault (retain_until set)
  → FP deactivation request → tombstone row (user_id hash, retain_until) → CLOSED
CLOSED → confirmation SMS+email (Apple requires completion confirmation) ; ≤30 days total
VAULT purge job: daily, deletes rows where retain_until < now() AND legal_hold = false
```

Design rules:
- Holdings do **not** block deletion. Units belong to the investor at the AMC/RTA, and blocking would conflict with Apple/Play expectations. The only blockers are in-flight money movements.
- If the same PAN re-registers later, it gets a new account and fresh consents. The vault record stays separate and is never automatically re-linked.
- A `legal_hold` flag, set by compliance for regulator or law-enforcement requests, stops the purge.

### 4.4 UX and placement

| Item | Value |
|---|---|
| Path | Profile tab → Settings → Account & data → **Delete account**. Label it "Delete account", not only "Close" or "Deactivate" (Apple treats deactivation alone as insufficient). |
| Partial options on the same screen | "Remove imported external holdings", "Withdraw analytics/marketing consent", "Sign out of all devices". These back the Play "partial deletion" answer. |
| Timeline copy | "Your request takes effect in 7 days (you can cancel until then). Deletion completes within 30 days. We'll confirm by SMS and email." |
| Retention copy | "As an AMFI-registered Mutual Fund Distributor we must keep KYC and transaction records for 8 years under anti-money-laundering and SEBI/AMFI rules. These are locked, used only for legal and regulatory purposes, and deleted after that period." Link to the privacy policy section. |
| Web | `/account/delete` on Next.js runs the same flow and API (the OTP login gives the Play web-resource URL). |

### 4.5 Backend implementation notes (NestJS 11 + Drizzle + PG18)

| Item | Note |
|---|---|
| Module | `AccountClosureModule` with a state column on `investors` and `closure_requests(id, investor_id, state, requested_at, execute_after, completed_at, reason)`. |
| Vault | A separate PG schema `retention` with its own DB role. Only the ops/admin "Compliance" role can read it, through an audited endpoint. Columns use pgcrypto or app-level envelope encryption with an AWS KMS key. v1 stored PII in plaintext (per the synthesis brief, "PII stored plaintext… No column-level encryption"). Don't repeat that. |
| Data-class registry | Every Drizzle table and column carries a `dataClass` tag (R1–R4/S1/N1–N4) in a shared `@sanchay/data-classes` package. A CI check fails the build when a new column is untagged. The closure job is generated from the registry. |
| Jobs | BullMQ/pg-boss jobs for `closure.execute` and `retention.purge`, idempotent and resumable. |
| FP | Cancel SIPs and mandates through the FP APIs before EXECUTING, and reconcile webhook confirmations. |
| Evidence | Store the closure request, the OTPs used (hashed) and completion notices in R3. |

v1 note: v1 had no account-deletion capability, only soft-delete `deleted_at` columns (`investor/platiziowealthtech-Back_end/src/main/resources/db/migration/V1__baseline_schema.sql:59,149,197`), so this is new build work.

---

## 5. Mobile security controls (Expo implementation)

Column key: **DB** = dev build required (Expo Go unsupported or insufficient). **CP** = config plugin required.

### 5.1 Master control list

| ID | Control | P | Library / mechanism | CP | DB | Notes |
|---|---|---|---|---|---|---|
| M01 | Block screenshots/recording on sensitive screens | P0 | `expo-screen-capture` → `usePreventScreenCapture(key)` | No | No (works in Go) | Android sets FLAG_SECURE. iOS 13+ blocks screenshots and recordings. **Don't** use `addScreenshotListener` on Android ≤13: it needs READ_MEDIA_IMAGES, which triggers the Play Photo/Video declaration. |
| M02 | Hide the app-switcher/recents snapshot app-wide | P0 | iOS: `enableAppSwitcherProtectionAsync(blur)` (expo-screen-capture). Android ≥13: `setRecentsScreenshotEnabled(false)` through `@bam.tech/react-native-app-security` `preventRecentScreenshots` | Yes (bam) | Yes | On Android <13 the bam lib uses FLAG_SECURE, which would block screenshots app-wide. That is **accepted** for <13 because it is the only reliable recents protection there. |
| M03 | Server-verified app/device integrity | P1 (monitor), P2 (enforce) | `@expo/app-integrity` (Play Integrity Standard request + App Attest) | Yes | Yes | **Alpha.** Wrap it in `@sanchay/integrity`. The backend verifies tokens on login, adding a bank, nominee/contact changes, placing orders and mandate creation. Start in monitor-only mode and enforce after 2 stable sprints. |
| M04 | Root/jailbreak/hook/tamper detection (client-side) | P1 | `freerasp-react-native` (Talsec) | Yes (`freerasp-react-native/app.plugin.js`) | Yes | Covers root/Magisk hiders, jailbreak, Frida, debugger, emulator, repackaging (signing-cert hash), unofficial store. **Free only up to 100k devices** (FUP), and it sends telemetry to Talsec, so disclose it. Budget for RASP+ at around 80k installs, or fall back to `jail-monkey` together with M03. |
| M05 | Response policy for M03/M04 | P1 | Backend risk engine | — | — | **Rooted/jailbroken:** show a warning banner, force OTP step-up on every sensitive action, and shorten refresh-token lifetime to 24h. **Hooking/debugger/tampered or repackaged app:** hard block with a "Reinstall from Play Store/App Store" screen. **Emulator:** block in production builds. |
| M06 | TLS certificate pinning | P1 | `react-native-ssl-public-key-pinning` (OkHttp CertificatePinner / TrustKit) | No (autolinked) | Yes | Pin the **SPKI of Amazon Root CA 1 + 2** plus one **backup CA** (e.g. ISRG Root X1), only for `api.sanchay.in`. Don't pin ACM leaf certificates, which rotate on renewal. Pins are initialised in JS, so they can be rotated through code-signed EAS Update. Disable the dev-client network inspector (`expo-build-properties` `networkInspector:false`) for pinning tests. |
| M07 | Secure token storage | P0 | `expo-secure-store` (Keychain / Keystore-encrypted prefs) | Yes (`faceIDPermission`, `configureAndroidBackup:true`) | Yes (for Face ID) | Refresh token only, stored with `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`. The access token (10 min) stays **in memory only**. Values stay small because of the ~2 KB iOS limit. |
| M08 | Clear the Keychain on reinstall | P0 | First-run flag in non-secure storage → `SecureStore.deleteItemAsync` for every key | No | No | iOS Keychain survives uninstall (Expo docs). Without this, stale refresh tokens would come back after reinstall. |
| M09 | No PII in plain storage | P0 | Lint rule banning AsyncStorage/MMKV writes of `@sanchay/api` DTOs. TanStack Query persistence is limited to public fund-catalogue data. | — | — | Portfolio and profile are re-fetched after unlock. The low-end-Android speed target is met with skeleton UIs and not by caching PII. |
| M10 | Biometric / device-credential app lock | P1 | `expo-local-authentication` `authenticateAsync({ biometricsSecurityLevel:'strong', disableDeviceFallback:false })` | Yes (`faceIDPermission`) | Yes (Face ID) | Lock on cold start and after **5 min** in the background. Device PIN/pattern is the fallback. If `getEnrolledLevelAsync()===NONE`, show an "enable a screen lock" nudge and use the 24h refresh-token lifetime. This is a **local gate only**. SEBI 2FA for orders is still the FP/AMC OTP (§5.6). |
| M11 | OTP autofill (iOS) | P0 | `TextInput textContentType="oneTimeCode"` plus the **domain-bound** SMS last line `@sanchay.in #123456` and `webcredentials:sanchay.in` | Associated Domains via app config | No | The same format enables WebOTP on the Next.js web app. |
| M12 | OTP autofill (Android) | P0 | Zero-code: `autoComplete="sms-otp"`. Login OTPs we send: **SMS Retriever** (11-char hash in the DLT template). FP/RTA 2FA OTPs we don't control: **SMS User Consent API**. | In-house Expo Module `@sanchay/sms-otp` (Kotlin, Expo Modules API) | Yes | **No SMS permissions.** Compute the hash from the **Play App Signing** certificate, not the upload key, and register it in the MSG91 DLT template. Put the hash and the `@sanchay.in #code` line at the end of the ≤140-byte SMS. |
| M13 | Clipboard hygiene | P1 | `expo-clipboard` write-only, used for copying a folio or UPI reference, cleared after 60 s. `contextMenuHidden` on OTP/PAN/account fields. Never read the clipboard programmatically. | No | No | Avoids iOS paste banners and Android 12+ clipboard toasts. |
| M14 | Keyboard/autofill hardening | P1 | Sensitive inputs use `autoCorrect={false}`, `autoComplete="off"`, and `importantForAutofill="no"` for bank account number. `@bam.tech` safe-keyboard detector (Android) warns on third-party keyboards on PAN/bank screens. | Yes (bam) | Yes | |
| M15 | Push content rules | P0 | `expo-notifications`. Android channels: `transactions` (lockscreenVisibility PRIVATE), `security` (PRIVATE), `marketing` (opt-in). iOS categories with `previewPlaceholder` / `showTitle`. | Yes | Yes (Android push not in Go since SDK 53) | See §5.4. |
| M16 | Crash reporting with PII scrubbing | P0 | `@sentry/react-native` plus the `@sentry/react-native/expo` plugin, **EU region** | Yes | Yes | See §5.5. |
| M17 | OTA governance | P0 | `expo-updates` + EAS Update **code signing** (EAS Production plan) | App config | Yes | See §5.7. |
| M18 | Transport | P0 | `usesCleartextTraffic:false` (expo-build-properties). iOS ATS defaults with no `NSAllowsArbitraryLoads`. HSTS on the API. | Yes | — | |
| M19 | Hosted third-party flows in system browser tabs | P0 | `expo-web-browser` (`openAuthSessionAsync`) for DigiLocker, eSign, IPV, netbanking/UPI gateway pages | No | No | No WebView means no JS bridge and no CAMERA/RECORD_AUDIO permission (A3). Returns come through verified App Links / Universal Links. |
| M20 | Verified deep links only | P0 | `ios.associatedDomains`, `android.intentFilters` with `autoVerify:true` on `https://sanchay.in/app/*`. The custom scheme `sanchay://` is used for dev only and never for auth or payment callbacks. | App config | — | Every deep-link param is validated server-side. Deep links cannot trigger state-changing actions without an authenticated confirm screen. |
| M21 | Build hardening | P0 | `enableMinifyInReleaseBuilds` + `enableShrinkResourcesInReleaseBuilds` (R8). Hermes bytecode. `babel-plugin-transform-remove-console` in production. Source maps uploaded to Sentry only, never bundled. | Yes | — | |
| M22 | Backup exclusion | P0 | `android.allowBackup:false` | App config | — | Also stops ADB backups of cached data. |
| M23 | Permission minimisation | P0 | `android.blockedPermissions` (§6) and no unused iOS purpose strings | App config | — | This is what keeps the Play declarations empty. |
| M24 | Overlay/tapjacking protection on order/consent confirm screens | P2 | In-house Expo Module calling `Window.setHideOverlayWindows(true)` (Android 12+, needs `HIDE_OVERLAY_WINDOWS`) + freeRASP overlay/malware signals | Yes (custom plugin) | Yes | Android 12+ already blocks untrusted overlay touches partly. This closes the remainder. |
| M25 | Session management | P0 | Server: rotating refresh tokens (reuse detection → revoke the family), device list with remote sign-out, new-device alert by SMS/email, idle timeout 15 min server-side | — | — | v1 had a 1-hour JWT and no investor refresh-token flow (synthesis brief, `application.yml:211-213`, not reproduced). |
| M26 | Step-up authentication | P0 | Server-issued OTP to the registered mobile/email for bank add/change, nominee change, contact change, account deletion, and any order where FP doesn't enforce 2FA itself | — | — | Carry over v1's snapshot-hash-consume consent mechanics, but gate **every** FP write. The synthesis brief `[CORRECTED, L15/C1]` records that v1 `createOrder` fires before the challenge exists. |
| M27 | Aadhaar handling | P0 | The app never accepts, stores or logs a full Aadhaar number. DigiLocker/KRA only, masked XXXX-1234 at most. | — | — | Aadhaar Act/UIDAI restrictions. It must also be kept out of Sentry and analytics. |
| M28 | Security testing | P1 | OWASP MASVS L1 + MASVS-RESILIENCE baseline. MobSF static scan in CI on every release APK/IPA. Pre-launch third-party pentest. | — | — | Enables the optional Play MASA badge (P2). |

### 5.2 Screen-capture policy by screen

| Screen group (Expo Router) | FLAG_SECURE / iOS block | Rationale |
|---|---|---|
| Login OTP, 2FA/consent OTP, app-lock prompt | **Block** | Credentials |
| KYC: PAN, address, FATCA, nominee, bank + penny drop, eSign return | **Block** | Identity/PII |
| Profile → personal & bank details | **Block** | PII |
| Order review/confirm, redemption confirm, mandate setup | **Block** | Prevents screen-share social engineering ("share your screen so I can help") |
| Statements/tax PDF viewer | **Block** in-app. The explicit "Download/Share PDF" action is the sanctioned export. | PII in documents |
| Dashboard, holdings, fund catalogue/detail, SIP list | **Allow** (the recents snapshot is still hidden by M02) | Mass-market users screenshot for help and sharing. The data is lower risk. |

Implementation: create a `<SecureScreen>` wrapper that calls `usePreventScreenCapture(routeKey)` and use it in each route's layout. Using a unique key per screen keeps nested screens from re-enabling capture early. A remote-config flag `secureScreens` lets you adjust the list over the air.

### 5.3 Certificate pinning trade-offs (decision record)

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| No pinning (TLS + CT + integrity attestation) | No lockout risk | Weaker against user-installed CAs and corporate MITM. SEBI/AMC security questionnaires often ask for pinning. | Rejected |
| Leaf/intermediate SPKI pinning | Strongest | ACM renewals and CA intermediate changes can brick every installed client | Rejected |
| **CA-root SPKI pinning (Amazon Root CA 1/2 + backup CA), JS-initialised, OTA-rotatable** | Blocks rogue/user CAs. A new binary isn't needed to rotate. EAS Update runs on `u.expo.dev` (not pinned), so recovery stays possible. | A CA switch needs an OTA release before the cut-over | **Chosen.** Runbook: add the new pin as a third pin through a code-signed OTA ≥30 days before any CA change. |

Android `network_security_config` does **not** trust user CAs in release builds (the default for targetSdk ≥24). Don't add `<certificates src="user">`.

### 5.4 Push notification content rules

| Event | Allowed lock-screen text (default) | Never include |
|---|---|---|
| SIP instalment processed/failed | "Your SIP instalment update is ready. Tap to view." | Amount, fund name, folio, bank |
| Order allotted / redemption paid | "Your order status has changed." | Units, NAV, amount, bank last-4 |
| Mandate / KYC status | "Action needed on your account." | PAN, KYC details |
| Security (new device login, bank change) | "New sign-in to your Sanchay account. Not you? Open the app." | IP, location, device model |
| Marketing (opt-in only) | Fund/category promos following SEBI/AMFI ad norms: no return assurance (AMFI 4(g)), and the landing screen carries the MF risk disclaimer | Personal data of any kind |
| Always | — | **OTPs** (sent by SMS/email only), PAN, Aadhaar, folio, account numbers |

Other rules:
- An in-app setting **"Show details in notifications" is off by default**. Turning it on adds the fund short name and a rounded amount (`transactions` channel only).
- The payload carries only an opaque `eventId`. The app fetches the details after unlock.
- Consent: request the notification permission (Android 13 POST_NOTIFICATIONS / iOS) **after** onboarding, with a pre-prompt. The app works fully without it (5.1.2(i)). Marketing consent is a separate toggle and is recorded in the consent ledger (R4).
- Transport: **Expo Push Service** at launch (less work for 2 developers). It must be listed as a sub-processor. Because payloads are generic and PII-free, the extra hop is acceptable. Migration path: `getDevicePushTokenAsync` plus direct FCM HTTP v1 / APNs from NestJS if a compliance review requires it.

### 5.5 Crash reporting with PII scrubbing (Sentry)

| Setting | Value |
|---|---|
| Region | **EU org (`de.sentry.io`)**. The region can't be changed after the org is created. |
| SDK init | `sendDefaultPii:false`, `attachScreenshot:false`, `attachViewHierarchy:false`, **no `mobileReplayIntegration`**, `enableCaptureFailedRequests:false` (bodies are never captured), `maxBreadcrumbs:50` |
| User context | `Sentry.setUser({ id: <opaque random install-scoped UUID> })`. Never email, phone or PAN. |
| `beforeSend` / `beforeBreadcrumb` | Drop `request.data`, `extra.response`, and query strings. Regex-redact PAN `[A-Z]{5}[0-9]{4}[A-Z]`, Indian mobile `[6-9]\d{9}`, email, IFSC `[A-Z]{4}0[A-Z0-9]{6}`, 9–18 digit account numbers, Aadhaar-like 12 digits, and JWTs `eyJ…`. Drop breadcrumbs of category `console` in production. Strip route params from navigation breadcrumbs (`/fund/:isin` OK, `/order/:id` → `/order/*`). |
| Server-side | Enable Data Scrubber + "Use Default Scrubbers", add advanced scrubbing rules with the same regexes, and turn off IP address storage. |
| Source maps | Uploaded during the EAS build (Sentry Expo plugin), with release = `appVersion+updateId` so OTA bundles symbolicate. |
| Fallback | If Platizio's AMC agreements or a compliance review require India-only diagnostics, run self-hosted Sentry or GlitchTip (Sentry-SDK compatible) in ap-south-1. No code changes, just a DSN swap. |

### 5.6 OTP and SEBI 2FA interplay

| OTP | Sender | Format controlled? | Autofill mechanism |
|---|---|---|---|
| Login / step-up (Sanchay) | MSG91, DLT template | Yes | iOS: `oneTimeCode` + domain-bound `@sanchay.in #123456`. Android: SMS Retriever (hash). Web: WebOTP. |
| SEBI 2FA for subscription/redemption | FP/AMC/RTA to the registered mobile/email | No | iOS: `oneTimeCode` heuristic. Android: **SMS User Consent** (one-tap, no permission). Email OTP is typed manually. |

Implementation notes:
- Template example (≤140 bytes): `123456 is your Sanchay OTP. Valid 5 min. Never share it. -Platizio\nFA+9qCX9VSu\n@sanchay.in #123456`
- Keep one DLT template per signing key. The Play App Signing hash differs from debug/internal builds, so build a separate internal-build template or use manual entry there.

### 5.7 OTA update (EAS Update) policy

| Rule | Detail |
|---|---|
| Allowed via OTA | JS bug fixes, copy/translation, disclaimer and compliance text, layout, feature-flag **off** switches, pin rotation (M06), `secureScreens` list |
| Store build required | Any native change, SDK upgrade, new permission, **any new user-facing regulated capability** (e.g. enabling STP/SWP, new payment method, CAS import). Their code can ship dark in a store build, and the **feature must be declared in Review Notes** before it is switched on remotely (Apple 2.3.1(a)). |
| Never | Downloading native code, dex, `.so` or remote JS evaluated outside the signed bundle. `eval` of server strings. Remote JS inside WebViews with bridges. |
| Integrity | End-to-end **code signing**: `npx expo-updates codesigning:generate`, with `updates.codeSigningCertificate` and `codeSigningMetadata {keyid:'main', alg:'rsa-v1_5-sha256'}` in the app config. The private key is kept offline (1Password vault + hardware-backed CI secret for the signing job only). Clients reject unsigned updates. |
| Compatibility | `runtimeVersion: { policy: 'fingerprint' }` |
| Rollout | Channels `production` / `preview`. **10% → 50% → 100%** over 24–48h, watching the Sentry crash-free-session rate (target ≥99.5%). `eas update:republish` is the rollback. |
| Startup cost on low-end Android | `checkAutomatically:'ON_LOAD'`, `fallbackToCacheTimeout:0`: never block launch on a download. The update applies on the next cold start. Critical fixes use `Updates.reloadAsync()` only at a safe point, never mid-order. |
| Audit | Every OTA gets a changelog entry that links the PR, with a classification of "fix / copy / compliance / pin-rotation". Compliance signs off any change to disclaimer or commission text. |

---

## 6. Reference `app.config.ts` excerpt (for implementers)

The key names below were checked against the SDK 57 docs fetched above (build-properties, secure-store, local-authentication, notifications, updates code signing). Plugin option names for third-party libraries follow their own docs.

```ts
// apps/mobile/app.config.ts (excerpt)
export default ({ config }) => ({
  ...config,
  name: 'Sanchay', slug: 'sanchay', scheme: 'sanchay', // dev-only scheme
  runtimeVersion: { policy: 'fingerprint' },
  updates: {
    url: 'https://u.expo.dev/<project-id>',
    checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 0,
    codeSigningCertificate: './certs/certificate.pem',
    codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' },
  },
  ios: {
    bundleIdentifier: 'in.sanchay.app',
    associatedDomains: ['applinks:sanchay.in', 'webcredentials:sanchay.in'],
    config: { usesNonExemptEncryption: false },
    privacyManifests: { NSPrivacyTracking: false, NSPrivacyTrackingDomains: [], NSPrivacyAccessedAPITypes: [/* CA92.1, C617.1, 35F9.1, E174.1 — confirm via Xcode privacy report */] },
  },
  android: {
    package: 'in.sanchay.app',
    allowBackup: false,
    blockedPermissions: [
      'com.google.android.gms.permission.AD_ID',
      'android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.RECORD_AUDIO',
      'android.permission.CAMERA', 'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.READ_SMS', 'android.permission.RECEIVE_SMS',
    ],
    intentFilters: [{ action: 'VIEW', autoVerify: true,
      data: [{ scheme: 'https', host: 'sanchay.in', pathPrefix: '/app' }],
      category: ['BROWSABLE', 'DEFAULT'] }],
  },
  plugins: [
    'expo-router',
    ['expo-build-properties', {
      android: { enableMinifyInReleaseBuilds: true, enableShrinkResourcesInReleaseBuilds: true,
                 usesCleartextTraffic: false, networkInspector: process.env.APP_VARIANT !== 'production' ? true : false },
      ios: { networkInspector: process.env.APP_VARIANT !== 'production' ? true : false },
    }],
    ['expo-secure-store', { configureAndroidBackup: true, faceIDPermission: 'Use Face ID to unlock Sanchay.' }],
    ['expo-local-authentication', { faceIDPermission: 'Use Face ID to unlock Sanchay.' }],
    ['expo-notifications', { /* icon, color, defaultChannel: 'transactions' */ }],
    ['@sentry/react-native/expo', { url: 'https://de.sentry.io/', organization: '<org>', project: 'sanchay-mobile' }],
    ['@bam.tech/react-native-app-security', { preventRecentScreenshots: { ios: { enabled: true }, android: { enabled: true } } }],
    ['freerasp-react-native/app.plugin.js', { android: { minSdkVersion: '24' } }],
    '@expo/app-integrity',
    './plugins/with-sanchay-android-hardening', // hide-overlay-windows (M24), network_security_config (no user CAs)
    './plugins/with-sanchay-sms-otp',           // in-house Expo Module registration (M12)
  ],
});
```

Package layout: keep `apps/mobile` plus `packages/mobile-security` (`<SecureScreen>`, app-lock hook, pinning init, integrity client, scrubbers shared with `apps/web` Sentry) and `packages/expo-plugins`.

Only if native UPI intent is adopted later (not at launch under A3), add `expo-build-properties.android.manifestQueries` for the `upi` scheme and iOS `LSApplicationQueriesSchemes`.

---

## 7. Release gate (per store build)

| Check | Tool |
|---|---|
| Merged AndroidManifest has none of the blocked permissions, and `allowBackup=false` | `aapt2 dump permissions` / CI script on the AAB |
| targetSdk 36, 16 KB alignment OK | Play Console bundle explorer / `zipalign -P 16 -c` |
| iOS privacy report matches the ASC nutrition label, and no tracking domains | Xcode Organizer → Generate Privacy Report |
| FLAG_SECURE present on the §5.2 screens | Detox/Maestro test asserting a black screenshot |
| Pinning rejects a mitmproxy CA on the release build | Manual QA script |
| Sentry test event contains no PII (run with a seeded PAN/mobile in the error message) | CI smoke |
| OTA signed; an unsigned update is rejected | EAS preview channel test |
| Reviewer account guard assertion passes | Backend startup test (§3.4) |
| MobSF scan has no High findings | CI |

---

## 8. Sources

All accessed 2026-09-25.

- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple, Offering account deletion in your app: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Apple App Privacy Details: https://developer.apple.com/app-store/app-privacy-details/
- Apple privacy manifests: https://developer.apple.com/documentation/bundleresources/privacy-manifest-files ; https://developer.apple.com/news/?id=pvszzano
- Apple SDK minimums: https://developer.apple.com/news/upcoming-requirements/
- Apple age ratings: https://developer.apple.com/news/?id=ks775ehf
- Apple DPLA: https://developer.apple.com/support/terms/apple-developer-program-license-agreement/
- Apple domain-bound codes: https://developer.apple.com/news/?id=z0i801mg
- Play account types: https://support.google.com/googleplay/android-developer/answer/13634885 ; https://support.google.com/googleplay/android-developer/answer/13628312
- Play testing requirement: https://support.google.com/googleplay/android-developer/answer/14151465
- Play Financial features declaration: https://support.google.com/googleplay/android-developer/answer/13849271
- Play Financial Services policy: https://support.google.com/googleplay/android-developer/answer/9876821
- Play country requirements (India/SEBI): https://support.google.com/googleplay/android-developer/answer/6223646
- Play account deletion: https://support.google.com/googleplay/android-developer/answer/13327111
- Play Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Play target API: https://support.google.com/googleplay/android-developer/answer/11926878
- Play SMS/Call Log: https://support.google.com/googleplay/android-developer/answer/10208820
- Play Photo/Video: https://support.google.com/googleplay/android-developer/answer/14115180
- Play Device & Network Abuse: https://support.google.com/googleplay/android-developer/answer/16559646
- Play Advertising ID: https://support.google.com/googleplay/android-developer/answer/6048248
- 16 KB pages: https://android-developers.googleblog.com/2025/05/prepare-play-apps-for-devices-with-16kb-page-size.html
- Android developer verification: https://support.google.com/android-developer-console/answer/16561738 ; https://thehackernews.com/2026/06/google-sets-sept-30-deadline-for.html
- SMS Retriever: https://developers.google.com/identity/sms-retriever/verify
- SEBI Verified Label PR (2026-03-25): https://www.sebi.gov.in/media-and-notifications/press-releases/mar-2026/chairman-sebi-today-launched-an-important-investor-protection-measure-in-the-form-of-verified-label-for-stock-trading-apps-of-brokers-registered-with-sebi-on-google-play-store_100616.html
- SEBI MF 2FA: https://www.sebi.gov.in/legal/circulars/mar-2022/discontinuation-of-usage-of-pool-accounts-for-transactions-in-the-units-of-mutual-funds-two-factor-authentication-2fa-for-redemption-and-other-related-requirements-extension-of-timeline_57471.html ; https://taxguru.in/sebi/two-factor-authentication-transactions-units-mutual-funds.html
- AMFI MFD Master Circular AMFI/MFD-CIR/32/2025-26 (2026-01-14): https://www.amfiindia.com/uploads/AMFI_Master_Cicular_for_MF_Ds_3c7f5ee44f.pdf
- SEBI AML/PMLA: https://www.sebi.gov.in/sebi_data/attachdocs/jul-2018/1530683670247.pdf ; https://taxguru.in/sebi/sebi-guidelines-aml-cft-standards-obligations-pmla-2002.html
- DPDP Rules 2025: https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf
- CERT-In Directions 2022: https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf
- Expo SDK 57 / modules: https://expo.dev/changelog/sdk-57 ; https://docs.expo.dev/versions/latest/sdk/screen-capture/ ; https://docs.expo.dev/versions/latest/sdk/securestore/ ; https://docs.expo.dev/versions/latest/sdk/local-authentication/ ; https://docs.expo.dev/versions/latest/sdk/app-integrity/ ; https://docs.expo.dev/versions/latest/sdk/notifications/ ; https://docs.expo.dev/versions/latest/sdk/build-properties/ ; https://docs.expo.dev/eas-update/introduction/ ; https://docs.expo.dev/eas-update/code-signing/
- freeRASP: https://docs.talsec.app/freerasp/freerasp/integration/react-native/expo ; FUP https://docs.talsec.app/freerasp/fair-usage-policy-fup
- BAM app-security: https://github.com/bamlab/react-native-app-security
- SSL pinning: https://github.com/frw/react-native-ssl-public-key-pinning
- Sentry: https://docs.sentry.io/platforms/react-native/guides/expo/data-management/sensitive-data/ ; https://docs.sentry.io/organization/data-storage-location/
- Android 13 recents / 15 screen-recording APIs: https://developer.android.com/about/versions/14/features/screenshot-detection ; https://proandroiddev.com/screen-recording-detection-android-15-26ee709b66b4

v1 code referenced (read-only):
- `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/OtpService.java:101`
- `…/config/BypassCodeStartupGuard.java:22,57`
- `…/service/SmsOtpService.java:15,27,39,88,111`
- `…/controller/InvestorAuthController.java:75`
- `…/service/InvestorAuthService.java:154-155`
- `…/src/main/resources/db/migration/V1__baseline_schema.sql:59,149,197`

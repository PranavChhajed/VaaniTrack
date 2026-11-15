# Quick capture and optional account beta

Implementation and verification record, 15 November 2026.

Release artifact: `android/VaaniTrack-1.3.0.apk`, version code 7. SHA-256: `16DD536B1727F76E502C19F8916C4246D6CA30AC772D98E76BCBFB0408ED1A9B`. Release signature verified and matched the existing Digital Asset Links certificate; in-place emulator installation succeeded. The final notification privacy/Stop-only adjustment passed release build/lint; the 10 emulator recorder checks ran before that adjustment.

## Delivered behavior

- APK 1.3.0 adds an Android Quick Settings tile named **Record expense**. It opens a visible native recorder before starting the existing microphone service. Stop, Cancel, a ready haptic, permission handling, process-death recovery, and the existing 45-second timeout are retained. Locked capture is opt-in and exposes no expense content. Nothing OS power-button mapping remains a system setting, not a global interception feature.
- Simulated password authentication is removed. Optional invite-only accounts use Supabase email codes, server-verified identity, HttpOnly cookies, and refresh. Guest capture does not require an account.
- Guest and account journals remain separate. Import is explicit; the guest copy survives import and sign-out. Account changes queue offline, use operation IDs and revisions, retain deletion tombstones, and offer explicit conflict resolution. One account editor tab is allowed at a time because browser localStorage has no atomic cross-tab writes. Other devices use server revision checks.
- Native widget captures remain device-local until explicitly imported. Existing anonymous diagnostic records are never claimed as account expenses.
- WhatsApp webhook verification, hashed expiring linking tokens, masked-number confirmation, durable incoming jobs, retry leases, capture review, Confirm/Discard/Undo buttons, editable recovery text, and a separate reply outbox are implemented. A reply is prepared in the same transaction as its saved expense. Ambiguous sends are not retried automatically. Edited expenses cannot be undone through an old acknowledgement.
- Audio is bounded to 10 MB and 60 seconds, validated by ffprobe, passed through the existing speech/extraction pipeline, and deleted from temporary disk in `finally`. There is no research-audio retention in this path. Models and recognition thresholds have not been changed.

## Required setup before enabling the beta

Nothing is provisioned or enabled in production by these changes. No paid Meta messages were sent. Live sign-in/email delivery, live WhatsApp, and Nothing Phone (2)/Android 16 remain unverified.

1. Use a separate beta PostgreSQL database. Apply `supabase/006_accounts.sql`, then `supabase/007_whatsapp_captures.sql`. The migrations create only `account_private`; they do not touch existing diagnostic or guest data. Browser roles receive no grants on that schema. Journal/operation tables have forced row-level security; other tables are server-only. Configure server/worker credentials privately; do not expose a database service key to the browser.
2. Configure Supabase email OTP delivery and the email template to include the token. Allowlist beta email addresses. Test delivery and refresh with an invited account before setting `ACCOUNTS_ENABLED=1`.
3. Create a Meta developer app with a **test business number**, and allowlist the user's personal sender number. The personal number is the sender, not the bot's receiving identity. Confirm the current Meta test-number limitations and billing configuration before enabling sending.
4. Configure the verified HTTPS webhook at `/api/whatsapp/webhook`. Set `WHATSAPP_ENABLED=1` only after credentials, database migrations, and sender restrictions are ready. Keep `WHATSAPP_SEND_ENABLED=0` until a controlled live test is authorized/configured. No template messages or reminders are sent; replies expire conservatively at 23 hours.
5. Run the separate worker on a continuously available development computer using `npm run worker:whatsapp`. It reads an ignored `.env.whatsapp.local`. A Vercel request does not host this worker. If the computer sleeps, incoming jobs wait durably; this is an invite-only development beta, not an always-on production service.

Server variables (configure secrets privately):

| Variable | Purpose |
| --- | --- |
| `ACCOUNTS_ENABLED` | Default off; `1` enables account routes |
| `APP_ORIGIN` | Exact origin for mutation CSRF checks |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Auth URL |
| `SUPABASE_PUBLISHABLE_KEY` | Auth API publishable key, kept in server configuration |
| `ACCOUNT_BETA_EMAILS` | Comma-separated invited emails |
| `ACCOUNT_DATABASE_URL` | Separate account beta database; never falls back to diagnostics |
| `WHATSAPP_ENABLED` | Default off; webhook/linking/worker switch |
| `WHATSAPP_APP_SECRET` | Meta webhook signature secret |
| `WHATSAPP_VERIFY_TOKEN` | Random webhook handshake token |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta test receiving number ID |
| `WHATSAPP_BUSINESS_NUMBER` | Test receiving number digits for the linking URL |
| `WHATSAPP_TEST_SENDERS` | Explicit comma-separated sender allowlist |
| `WHATSAPP_GRAPH_VERSION` | Supported Graph version verified in the Meta app |
| `WHATSAPP_ACCESS_TOKEN` | Worker-only Meta access token |
| `WHATSAPP_SEND_ENABLED` | Default off; separately enables replies |
| `WHATSAPP_FFPROBE_PATH` | Worker-only trusted ffprobe executable |
| `WHATSAPP_TEMP_DIR` | Worker audio temp directory on D: |
| `GROQ_API_KEY` | Existing worker speech/extraction provider |

## Verification

Tests use synthetic data and provider fixtures. No test expenses were sent to the production journal.

- Account PostgreSQL integration: 19 checks, including concurrent writes, retry receipts, deletion resurrection protection, cross-account reads and RLS under a non-superuser role.
- Account local queue: 17 checks, including offline retention, account switching, guest preservation, conflicts and deletion.
- Authentication: 17 fixture checks covering disabled flags, origin checks, allowlist, verified email, cookies, refresh and sign-out.
- Browser account flow: 105 checks, including the second-tab editor lock.
- Existing browser regression: capture/journal 13/13 (62 checks), settings/onboarding 19/19 (121), voice 14/14 (69).
- Existing transaction/pipeline regression: journal suite passed; 523 pipeline checks passed.
- WhatsApp PostgreSQL/signature fixtures: 22 checks including duplicate delivery, concurrent workers, token consumption, review, Undo, edited-row protection, lease recovery and ambiguous outbox sends.
- WhatsApp webhook route: 7 checks, including invalid signatures, oversized bodies and refusing acknowledgement when durable storage is unavailable.
- Audio: 13 checks using real ffprobe and synthetic Ogg; long/malformed/oversize input rejected, temporary files removed, untrusted media URLs rejected, silence rejected through mocked ASR.
- Android test build and lint passed. Android 14 emulator Quick Settings: 10 checks passed for recording, cancellation, repeated actions, process death and permission handling. Emulator System UI briefly reported an ANR under host load; the repeated test passed afterward. This does not establish Nothing OS behavior.
- Final web production build passed; eight fresh/returning launch cases passed across normal/throttled and normal/reduced-motion conditions. ESLint has zero errors and four pre-existing unused-import warnings in the journal test.

Build/test logs live under ignored `qa/shots/verification/` on D:. Models are unchanged, so this work makes no new measured recognition-accuracy or real WhatsApp latency claim. Live delivery latency cannot be measured without the Meta test setup.

## Remaining release gates and rollback

- Live account email/refresh, Meta voice/text/buttons, Android 16 locked capture and Nothing launcher behavior need verification before enabling their beta flags. Battery-saver, real speech/noise and OEM power shortcuts are not established by the Android 14 emulator.
- Account-wide erasure is not yet offered: the guest erasure tool refuses to operate while signed into an account. Individual account expense deletions sync as tombstones. Account cache is retained on sign-out; it is not an encrypted local vault.
- WhatsApp review-all defaults on. Unlink/relink is currently required to change that channel preference. Web/widget settings do not silently change a linked channel.
- Disable `WHATSAPP_SEND_ENABLED`, then `WHATSAPP_ENABLED` to stop that channel independently. Stop the worker. Disable `ACCOUNTS_ENABLED` to stop cloud access while retaining local pending data. Do not drop the schema or clear browser storage as rollback. Keep database backups and pending queues until resolved.
- The APK shares its signing identity and origin with previous releases; update in place. Do not uninstall to update, because uninstall removes native pending captures.

Sources: [Android Quick Settings](https://developer.android.com/develop/ui/views/quicksettings-tiles), [microphone foreground restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start), [Supabase verified user lookup](https://supabase.com/docs/reference/javascript/auth-getuser), [Meta platform overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview), [Meta media retrieval](https://www.postman.com/meta/whatsapp-business-platform/request/ptjyi84/retrieve-media-url), [Meta reply-button reference](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/interactive/), [FFmpeg downloads](https://ffmpeg.org/download.html). The archived Meta SDK was consulted for payload shape, not installed as a dependency.

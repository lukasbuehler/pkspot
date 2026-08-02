# Unified safety cases and email delivery pass

## Why this is held

The unified report, complaint, appeal, correspondence, and administrator case
workflow is implemented but intentionally hidden from the current client
release. Guest verification links and case updates depend on transactional
email delivery. Releasing the routes before that transport is operating would
expose a flow that can accept a case but cannot reliably return access to the
guest.

The current release keeps the existing entity report buttons, report
collections, moderation reports, safety incidents, and private contact form.
Do not deploy the safety-case producer Functions or re-enable their client entry
points during the event/client release.

## Existing application contract

Server-side producers write to `safety_case_email_outbox` using this shape:

```ts
{
  to: [recipient],
  message: {subject, text, html},
  case_id: caseId,
  template,
  created_at,
  delivery: {state: "PENDING"},
}
```

The email transport should remain generic: all localization and rendering is
already completed by the producer. Clients must continue to have no direct read
or write access to the outbox.

## Recommended implementation

Implement a small self-managed Cloud Functions Gen 2 Firestore trigger in
`europe-west1`; do not install a new managed Firebase Extension.

- Listen to `safety_case_email_outbox/{emailId}`.
- Transactionally claim `PENDING` or explicitly retried messages and set a
  bounded processing lease.
- Send `to` and `message.{subject,text,html}` using a transactional provider.
  SMTP through Nodemailer is sufficient; a provider API is also acceptable when
  it offers materially better idempotency and delivery telemetry.
- Store credentials in Secret Manager, preferably as one structured
  `SAFETY_EMAIL_CONFIG` secret. Never commit credentials or put them in ordinary
  environment files.
- Record attempts, start/end timestamps, provider message ID, accepted/rejected
  recipients, and a sanitized error. End in `SUCCESS` or `ERROR`; support an
  explicit administrator-controlled `RETRY` state.
- Treat the Firestore trigger as at-least-once. Use the outbox document ID as a
  provider idempotency key where supported. With plain SMTP, a crash after send
  but before the success write can still produce a duplicate, so messages and
  access links must remain safe when delivered more than once.
- Add structured logs and provider-side bounce/delivery monitoring. Do not log
  message bodies, verification tokens, or recipient addresses unnecessarily.

Firebase's open-source `firestore-send-email` implementation is a useful
reference for transactionally claiming messages, leases, delivery states, and
Nodemailer setup. Adapt the narrow behavior PK Spot needs instead of copying its
template system, user lookups, attachments, extension lifecycle, or broad
configuration surface.

## Provider setup

Before deploying the mailer:

1. Choose a transactional email provider and verify the `pkspot.app` sending
   domain.
2. Publish and verify the provider's SPF and DKIM records; review the existing
   DMARC policy before changing it.
3. Choose a sender such as `PK Spot Safety <safety@pkspot.app>` and a monitored
   reply-to address.
4. Create least-privilege SMTP or API credentials and store them in the
   production Firebase project's Secret Manager only after the Function defines
   the final secret name and schema.
5. Configure bounce/complaint reporting and decide who monitors delivery
   failures.

## Verification

- Unit-test payload validation, state transitions, sanitized failures, leases,
  retries, and duplicate trigger delivery.
- Emulator-test a real outbox write and confirm clients cannot access it.
- In production, send one controlled valid message and one invalid-recipient
  message. Verify `PENDING` to `PROCESSING` to `SUCCESS` and the expected
  `ERROR` path.
- Deploy the mailer before safety-case producer Functions. Then verify signed-in
  and guest submission, the one-time 24-hour access link, the scoped 30-day
  session, correspondence, decisions, and appeals.
- Dry-run and review the historical safety-case backfill before its non-notifying
  production run.
- Re-enable `/safety`, `/safety/cases/:publicReference`,
  `/moderation/cases`, and `/moderation/cases/:publicReference`; restore the
  Support, Settings, Terms, contribution-status, moderation-dashboard, static
  SSR, and route-test entry points removed in the holding release.
- Run localization extraction/analyzer, focused tests, `npm run test:all`, and
  the production web/mobile smoke checks before release.

`DEPLOYMENT_TASKS.md` remains the source of truth for the actual deployment
order and outstanding production verification.

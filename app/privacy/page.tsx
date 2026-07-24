import type { Metadata } from "next";
import { LegalLayout, H2, P, UL, A, LEGAL_CONTACT, LEGAL_OPERATOR } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy Policy — Character Studio",
  description:
    "How Character Studio processes Instagram messages, comments and identifiers, the legal basis and retention, the external services used, and your GDPR rights.",
  robots: { index: true, follow: true },
};

const UPDATED = "24 July 2026";
const IG = "@vivienne.mov";

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      updated={UPDATED}
      intro={`This Privacy Policy explains how Character Studio (the "Service") processes personal data when it manages direct messages and comments on the connected Instagram professional account ${IG}. The Service is operated by ${LEGAL_OPERATOR} (the "operator", "we", "us").`}
    >
      <H2>1. Who we are</H2>
      <P>
        Character Studio is operated by {LEGAL_OPERATOR}. We act as the data controller for the
        Instagram data described below. For any privacy question or request, contact us at{" "}
        <A href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</A>.
      </P>

      <H2>2. What Instagram data we process</H2>
      <P>
        When someone sends a direct message to, or comments on, the connected account {IG}, Meta
        delivers a webhook to the Service. We process only the data contained in those events and
        what is needed to respond:
      </P>
      <UL>
        <li>
          The sender&rsquo;s Instagram-scoped user ID (IGSID) — the per-app identifier Meta assigns
          to the person interacting with the account.
        </li>
        <li>
          The public username of the author — for <em>comments</em> only. Direct-message events do
          not include a username, so none is stored for DMs.
        </li>
        <li>The text content of the direct message or comment.</li>
        <li>
          Message and comment identifiers: the message ID (mid), comment ID, parent comment ID, and
          the related media ID.
        </li>
        <li>Timestamps of inbound and outbound interactions.</li>
        <li>
          The raw webhook payload delivered by Meta, retained for reliable, de-duplicated processing
          and troubleshooting.
        </li>
        <li>
          The result of automated processing: an AI classification (intent, risk level, whether to
          reply), the generated reply text, the AI model used, the AI provider&rsquo;s response, and
          the delivery status.
        </li>
        <li>When a reply is sent, the outbound reply text and the message ID Instagram returns.</li>
        <li>
          The access token issued by Meta for the connected account {IG}, stored securely and used
          only to call the Instagram API on that account&rsquo;s behalf.
        </li>
      </UL>
      <P>
        We do <strong>not</strong> collect Instagram passwords, payment details, follower lists,
        contact books, or a person&rsquo;s media library, and we do not process data from accounts
        other than the connected account. We do not build advertising or behavioural profiles.
      </P>

      <H2>3. Why we process it (purpose)</H2>
      <UL>
        <li>To receive and read direct messages and comments addressed to the connected account.</li>
        <li>
          To generate a relevant reply using an AI model and, where enabled, to send that reply back
          through Instagram within Instagram&rsquo;s messaging window.
        </li>
        <li>To keep a short conversation context (the most recent messages) so replies stay coherent.</li>
        <li>To de-duplicate and reliably retry webhook deliveries.</li>
        <li>To detect spam, scams and abusive content and avoid responding to them.</li>
      </UL>

      <H2>4. Legal basis</H2>
      <P>
        We process this data under Article 6(1)(f) GDPR (legitimate interests) — operating the
        connected account and responding to people who choose to contact it. The person initiates
        the interaction by messaging or commenting on the account. Where applicable law requires
        consent, we rely on Article 6(1)(a) GDPR.
      </P>

      <H2>5. Data retention</H2>
      <P>
        We retain messages, comments, identifiers and related metadata only as long as needed to
        operate the assistant and maintain conversation context, and in any case no longer than 24
        months. Access tokens are kept only while the integration is active and are removed or
        invalidated when it is disconnected. You may request earlier deletion at any time (see
        section 9).
      </P>

      <H2>6. External services (processors)</H2>
      <P>To operate the Service we share the minimum necessary data with:</P>
      <UL>
        <li>
          <strong>Meta Platforms</strong> — the Instagram Platform / Graph API, the source of
          inbound events and the destination for replies and published content.
        </li>
        <li>
          <strong>Anthropic</strong> — the Claude AI model, which receives the message or comment
          text and the recent conversation context in order to draft a reply. This content is not
          used to train models.
        </li>
        <li>
          <strong>Supabase</strong> — database hosting (EU region) where the data described in
          section 2 is stored.
        </li>
        <li>
          <strong>Vercel</strong> — application hosting that receives the Instagram webhooks and runs
          the Service.
        </li>
      </UL>
      <P>
        These providers process data on our behalf under their own security and privacy commitments.
        Some of them are established outside the EU/EEA; where data is transferred internationally it
        is protected by appropriate safeguards such as the European Commission&rsquo;s Standard
        Contractual Clauses. We do not transfer your data to any other third party.
      </P>

      <H2>7. How we protect your data</H2>
      <P>
        All traffic is served over HTTPS. Every inbound Instagram webhook is verified with a
        cryptographic signature (X-Hub-Signature-256) before it is accepted. Access tokens and
        database credentials are stored as protected secrets and are never exposed to end users.
      </P>

      <H2>8. Your rights under the GDPR</H2>
      <P>Subject to applicable law, you have the right to:</P>
      <UL>
        <li>access the personal data we hold about you;</li>
        <li>rectify inaccurate data;</li>
        <li>erase your data (&ldquo;right to be forgotten&rdquo;);</li>
        <li>restrict or object to processing;</li>
        <li>data portability;</li>
        <li>withdraw consent where processing is based on consent;</li>
        <li>
          lodge a complaint with a supervisory authority — in Slovakia, the Office for Personal Data
          Protection of the Slovak Republic (Úrad na ochranu osobných údajov SR).
        </li>
      </UL>
      <P>
        To exercise any of these rights, email <A href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</A>.
      </P>

      <H2>9. Requesting deletion of your data</H2>
      <P>
        You can ask us to delete your data at any time. See the{" "}
        <A href="/data-deletion">Data Deletion</A> page for the exact steps, or email{" "}
        <A href={`mailto:${LEGAL_CONTACT}?subject=Character%20Studio%20%E2%80%93%20Data%20Deletion%20Request`}>
          {LEGAL_CONTACT}
        </A>{" "}
        with the subject &ldquo;Character Studio – Data Deletion Request&rdquo; and the Instagram
        username you used to contact the account. After we verify ownership, we delete the associated
        data within 30 days.
      </P>

      <H2>10. We do not sell your data</H2>
      <P>
        We do not sell, rent or trade personal data, and we do not use it for advertising or to build
        profiles about you.
      </P>

      <H2>11. Children</H2>
      <P>
        The Service is not directed to children under 13 (or the minimum age required in your
        country), and we do not knowingly process their data.
      </P>

      <H2>12. Changes to this policy</H2>
      <P>
        We may update this policy as the Service evolves. Material changes are reflected by updating
        the &ldquo;Last updated&rdquo; date at the top of this page.
      </P>

      <H2>13. Contact</H2>
      <P>
        {LEGAL_OPERATOR} — <A href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</A>.
      </P>
    </LegalLayout>
  );
}

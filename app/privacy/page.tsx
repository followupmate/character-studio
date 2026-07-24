import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Character Studio",
  description:
    "Privacy policy for Character Studio's Instagram automation, describing what data is processed, why, and how to request deletion.",
};

const EFFECTIVE_DATE = "24 July 2026";
const CONTACT_EMAIL = "grexpm@gmail.com";
const IG_HANDLE = "@vivienne.mov";

const wrap: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "64px 24px 96px",
  fontFamily: "var(--font-inter, system-ui, sans-serif)",
  color: "#e2e2ea",
  lineHeight: 1.65,
  fontSize: 15,
};
const h1: React.CSSProperties = {
  fontFamily: "var(--font-garamond, serif)",
  fontSize: 40,
  fontWeight: 700,
  marginBottom: 8,
  color: "#f4f4f8",
};
const h2: React.CSSProperties = {
  fontFamily: "var(--font-garamond, serif)",
  fontSize: 24,
  fontWeight: 600,
  margin: "40px 0 12px",
  color: "#f4f4f8",
};
const p: React.CSSProperties = { margin: "0 0 14px" };
const muted: React.CSSProperties = { color: "#8a919e", fontSize: 13 };
const ul: React.CSSProperties = { margin: "0 0 14px", paddingLeft: 22 };
const a: React.CSSProperties = { color: "#a4c9ff", textDecoration: "underline" };

export default function PrivacyPolicyPage() {
  return (
    <main style={wrap}>
      <h1 style={h1}>Privacy Policy</h1>
      <p style={muted}>
        Effective date: {EFFECTIVE_DATE}. This policy covers the Character Studio
        application and its automated Instagram messaging assistant operating on the
        Instagram account {IG_HANDLE}.
      </p>

      <h2 style={h2}>1. Who we are</h2>
      <p style={p}>
        Character Studio (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates an AI assistant that
        helps manage direct messages and comments on the Instagram professional account{" "}
        {IG_HANDLE}. We access Instagram data through Meta&rsquo;s Instagram Platform (the
        Instagram API with Instagram Login) strictly to provide this service. For any
        privacy question you can reach us at{" "}
        <a style={a} href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </p>

      <h2 style={h2}>2. What data we process</h2>
      <p style={p}>
        When a person interacts with our Instagram account, Meta sends us webhook events.
        We process only what is needed to read the interaction and reply:
      </p>
      <ul style={ul}>
        <li>
          The Instagram-scoped user ID (IGSID) and, for comments, the public username of the
          person who messaged or commented.
        </li>
        <li>
          The content of the direct message or comment, its message/comment ID, and the
          timestamp.
        </li>
        <li>
          The reply our assistant generates and, when sent, the outbound message ID returned
          by Instagram.
        </li>
        <li>
          Operational metadata: the raw webhook payload, our AI model&rsquo;s classification
          (intent, risk level), and delivery status, kept for reliability and abuse
          prevention.
        </li>
        <li>
          Account access tokens issued by Meta for {IG_HANDLE}, stored securely and used only
          to call the Instagram API on that account&rsquo;s behalf.
        </li>
      </ul>
      <p style={p}>
        We do <strong>not</strong> collect your Instagram password, payment details, contacts,
        or data from accounts other than {IG_HANDLE}. We do not build advertising profiles and
        we do not sell any data.
      </p>

      <h2 style={h2}>3. Why we process it (purpose)</h2>
      <ul style={ul}>
        <li>To read incoming direct messages and comments addressed to {IG_HANDLE}.</li>
        <li>
          To generate a relevant, human-like reply using an AI model and, where enabled, to
          send that reply back through Instagram within Instagram&rsquo;s messaging window.
        </li>
        <li>To keep short conversation context so replies stay coherent.</li>
        <li>To detect spam, scams and abusive content and avoid responding to them.</li>
      </ul>
      <p style={p}>
        The legal basis is our legitimate interest in operating the account and responding to
        people who choose to contact it. By sending a message to {IG_HANDLE} you initiate the
        conversation the assistant responds to.
      </p>

      <h2 style={h2}>4. Third-party processors</h2>
      <p style={p}>To run the service we share the minimum necessary data with:</p>
      <ul style={ul}>
        <li>
          <strong>Meta Platforms</strong> — Instagram Platform / Graph API, to receive and
          send messages and comments.
        </li>
        <li>
          <strong>Anthropic</strong> — the Claude AI model, which receives the message text and
          recent conversation context to draft a reply. This content is not used to train
          models.
        </li>
        <li>
          <strong>Supabase</strong> — database hosting where the data described above is stored.
        </li>
        <li>
          <strong>Vercel</strong> — application hosting that receives Instagram webhook requests.
        </li>
      </ul>
      <p style={p}>
        These providers act as processors under their own security and privacy commitments. We
        do not transfer your data to any other third party.
      </p>

      <h2 style={h2}>5. Data retention</h2>
      <p style={p}>
        We retain messages, comments and related metadata only as long as needed to operate the
        assistant and maintain conversation context, and no longer than 24 months. Access tokens
        are kept only while the integration is active and are deleted or invalidated when it is
        disconnected. You may request earlier deletion at any time (see below).
      </p>

      <h2 style={h2}>6. Your choices and rights</h2>
      <ul style={ul}>
        <li>
          <strong>Stop the assistant:</strong> reply with &ldquo;STOP&rdquo; in the Instagram
          conversation, or simply stop messaging the account, and the assistant will no longer
          respond to you.
        </li>
        <li>
          <strong>Access, correction, deletion:</strong> depending on your location you may have
          the right to access, correct, or delete your data, or object to its processing.
        </li>
      </ul>

      <h2 style={h2}>7. Data deletion requests</h2>
      <p style={p}>
        To have your data deleted, email{" "}
        <a style={a} href={`mailto:${CONTACT_EMAIL}?subject=Instagram%20data%20deletion%20request`}>
          {CONTACT_EMAIL}
        </a>{" "}
        with the subject &ldquo;Instagram data deletion request&rdquo; and the Instagram username
        you used to contact {IG_HANDLE}, or send us a direct message containing the word
        &ldquo;DELETE&rdquo;. We will delete the direct messages, comments and metadata
        associated with your Instagram-scoped ID within 30 days and confirm once done.
      </p>

      <h2 style={h2}>8. Security</h2>
      <p style={p}>
        Data is transmitted over HTTPS, and all inbound Instagram webhooks are verified with a
        cryptographic signature before being accepted. Access tokens and database credentials are
        stored as protected secrets and are never exposed to end users.
      </p>

      <h2 style={h2}>9. Children</h2>
      <p style={p}>
        The service is not directed to children under 13 (or the minimum age required in your
        country), and we do not knowingly process their data.
      </p>

      <h2 style={h2}>10. Changes to this policy</h2>
      <p style={p}>
        We may update this policy as the service evolves. Material changes will be reflected by
        updating the effective date at the top of this page.
      </p>

      <h2 style={h2}>11. Contact</h2>
      <p style={p}>
        Questions or requests:{" "}
        <a style={a} href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </p>

      <p style={{ ...muted, marginTop: 40 }}>
        Character Studio — automated Instagram messaging assistant for {IG_HANDLE}.
      </p>
    </main>
  );
}

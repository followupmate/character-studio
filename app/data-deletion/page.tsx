import type { Metadata } from "next";
import { LegalLayout, H2, P, UL, A, LEGAL_CONTACT, LEGAL_OPERATOR } from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Data Deletion — Character Studio",
  description:
    "How to request deletion of your data from Character Studio: email the operator with your Instagram username; after verification your data is deleted within 30 days.",
  robots: { index: true, follow: true },
};

const UPDATED = "24 July 2026";
const SUBJECT = "Character Studio – Data Deletion Request";
const MAILTO = `mailto:${LEGAL_CONTACT}?subject=${encodeURIComponent(SUBJECT)}`;

export default function DataDeletionPage() {
  return (
    <LegalLayout
      title="Data Deletion Request"
      updated={UPDATED}
      intro="You can ask us to delete the data Character Studio holds about your Instagram interactions. Follow the steps below and we will remove it after verifying that the request is yours."
    >
      <H2>How to request deletion</H2>
      <UL>
        <li>
          Send an email to <A href={MAILTO}>{LEGAL_CONTACT}</A>.
        </li>
        <li>
          Use the exact subject line: <strong>{SUBJECT}</strong>.
        </li>
        <li>Include the Instagram username you used to message or comment on the account.</li>
        <li>After we verify ownership of that Instagram account, we delete your data.</li>
        <li>Your request will be completed no later than 30 days after verification.</li>
      </UL>

      <P>
        <A href={MAILTO}>Click here to open a pre-filled deletion request email.</A>
      </P>

      <H2>What we delete</H2>
      <P>
        Once your request is verified, we permanently delete the data associated with your
        Instagram-scoped user ID, including:
      </P>
      <UL>
        <li>the direct messages and comments we received from you and any replies to them;</li>
        <li>
          the related identifiers and metadata (message, comment and media IDs, timestamps, raw
          webhook payloads);
        </li>
        <li>the AI processing records (classification and generated reply) linked to those messages;</li>
        <li>your contact record keyed to your Instagram-scoped user ID.</li>
      </UL>

      <H2>Other ways to stop and remove data</H2>
      <UL>
        <li>
          You can reply <strong>&ldquo;DELETE&rdquo;</strong> in the Instagram conversation to ask for
          removal, or <strong>&ldquo;STOP&rdquo;</strong> so the assistant no longer responds to you.
        </li>
        <li>
          If the connected account disconnects the app from its Instagram or Meta settings, the stored
          access token is removed and processing stops.
        </li>
      </UL>

      <H2>Contact</H2>
      <P>
        Data controller: {LEGAL_OPERATOR} — <A href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</A>. For
        more detail on how we handle data, see our <A href="/privacy">Privacy Policy</A>.
      </P>
    </LegalLayout>
  );
}

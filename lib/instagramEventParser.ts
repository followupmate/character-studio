export type ParsedInstagramEvent =
  | {
      kind: "dm";
      contactId: string;
      platformMessageId: string;
      text: string;
      timestamp: string | null;
      raw: unknown;
    }
  | {
      kind: "comment";
      contactId: string;
      username: string | null;
      platformMessageId: string;
      text: string;
      mediaId: string | null;
      parentCommentId: string | null;
      raw: unknown;
    };

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function parseDmEnvelope(envelopeValue: unknown): ParsedInstagramEvent | null {
  const envelope = asRecord(envelopeValue);
  if (!envelope) return null;

  const sender = asRecord(envelope.sender);
  const message = asRecord(envelope.message);
  const contactId = sender ? asString(sender.id) : null;
  const platformMessageId = message ? asString(message.mid) : null;
  const text = message ? asString(message.text) : null;

  if (!contactId || !platformMessageId || !text) return null;

  return {
    kind: "dm",
    contactId,
    platformMessageId,
    text,
    timestamp: asString(envelope.timestamp),
    raw: envelopeValue,
  };
}

export function parseInstagramEvents(payload: unknown): ParsedInstagramEvent[] {
  const root = asRecord(payload);
  const entries = root && Array.isArray(root.entry) ? root.entry : [];
  const parsed: ParsedInstagramEvent[] = [];

  for (const entryValue of entries) {
    const entry = asRecord(entryValue);
    if (!entry) continue;

    // Real Instagram DM deliveries use entry.messaging[].
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const envelopeValue of messaging) {
      const dm = parseDmEnvelope(envelopeValue);
      if (dm) parsed.push(dm);
    }

    // Meta's dashboard field test and comment deliveries use entry.changes[].
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const changeValue of changes) {
      const change = asRecord(changeValue);
      const field = change ? asString(change.field) : null;
      const value = change ? asRecord(change.value) : null;
      if (!field || !value) continue;

      if (field === "messages") {
        const dm = parseDmEnvelope(value);
        if (dm) parsed.push(dm);
        continue;
      }

      if (field === "comments") {
        const from = asRecord(value.from);
        const media = asRecord(value.media);
        const contactId = from ? asString(from.id) : null;
        const commentId = asString(value.id);
        const text = asString(value.text);
        if (!contactId || !commentId || !text) continue;

        parsed.push({
          kind: "comment",
          contactId,
          username: from ? asString(from.username) : null,
          platformMessageId: commentId,
          text,
          mediaId: media ? asString(media.id) : null,
          parentCommentId: asString(value.parent_id),
          raw: changeValue,
        });
      }
    }
  }

  return parsed;
}

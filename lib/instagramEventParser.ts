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
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseInstagramEvents(payload: unknown): ParsedInstagramEvent[] {
  const root = asRecord(payload);
  const entries = root && Array.isArray(root.entry) ? root.entry : [];
  const parsed: ParsedInstagramEvent[] = [];

  for (const entryValue of entries) {
    const entry = asRecord(entryValue);
    const changes = entry && Array.isArray(entry.changes) ? entry.changes : [];

    for (const changeValue of changes) {
      const change = asRecord(changeValue);
      const field = change ? asString(change.field) : null;
      const value = change ? asRecord(change.value) : null;
      if (!field || !value) continue;

      if (field === "messages") {
        const sender = asRecord(value.sender);
        const message = asRecord(value.message);
        const contactId = sender ? asString(sender.id) : null;
        const platformMessageId = message ? asString(message.mid) : null;
        const text = message ? asString(message.text) : null;
        if (!contactId || !platformMessageId || !text) continue;

        parsed.push({
          kind: "dm",
          contactId,
          platformMessageId,
          text,
          timestamp: asString(value.timestamp),
          raw: changeValue,
        });
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

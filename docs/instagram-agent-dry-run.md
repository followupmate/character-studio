# Instagram agent delivery

Required production environment variables:

```env
IG_AGENT_ENABLED=true
IG_AGENT_DRY_RUN=true
IG_USER_ID=
IG_ACCESS_TOKEN=
```

`IG_USER_ID` and `IG_ACCESS_TOKEN` are the same posting credentials already used
by the publish routes. The agent sends via `getIgAccessToken()`, so it reads the
DB-first token kept fresh by the weekly refresh cron and only falls back to
`IG_ACCESS_TOKEN` before the first refresh — the env var can lapse without
breaking delivery.

Optional overrides:

```env
IG_AGENT_MODEL=claude-3-5-haiku-latest
IG_GRAPH_API_VERSION=v23.0
```

With `IG_AGENT_DRY_RUN=true`, inbound Instagram DMs and comments are classified
and the generated reply is stored in `chs_ig_agent_runs`. Nothing is sent.

With `IG_AGENT_DRY_RUN=false`, the agent sends a reply only when the inbound
event is a DM, the model explicitly chooses to reply, the risk level is low, and
a non-empty reply was generated. Public comments remain dry-run only.

Delivery uses the Instagram API with Instagram Login send endpoint
(`POST https://graph.instagram.com/<version>/<IG_USER_ID>/messages`). Sending is
only possible inside the 24-hour messaging window that opens when a user messages
the account, and requires the `instagram_business_manage_messages` permission —
the same permission that unlocks inbound DM webhooks.

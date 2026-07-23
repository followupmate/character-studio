# Instagram agent delivery

Required production environment variables:

```env
IG_AGENT_ENABLED=true
IG_AGENT_DRY_RUN=true
IG_ACCESS_TOKEN=
IG_USER_ID=
```

Optional overrides:

```env
IG_AGENT_MODEL=claude-3-5-haiku-latest
IG_GRAPH_API_VERSION=v23.0
```

With `IG_AGENT_DRY_RUN=true`, inbound Instagram DMs and comments are classified and the generated reply is stored in `chs_ig_agent_runs`. Nothing is sent.

With `IG_AGENT_DRY_RUN=false`, the agent sends a reply only when the inbound event is a DM, the model explicitly chooses to reply, the risk level is low, and a non-empty reply was generated. Public comments remain dry-run only.

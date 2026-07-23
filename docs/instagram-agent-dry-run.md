# Instagram agent dry run

Required production environment variables:

```env
IG_AGENT_ENABLED=true
IG_AGENT_DRY_RUN=true
```

Optional model override:

```env
IG_AGENT_MODEL=claude-3-5-haiku-latest
```

With dry run enabled, inbound Instagram DMs and comments are classified and a reply is generated into `chs_ig_agent_runs`. No reply is sent to Instagram.

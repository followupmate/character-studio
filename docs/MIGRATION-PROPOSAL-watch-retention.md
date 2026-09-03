# Migračný návrh — watch retention v snapshotoch

**Stav: NÁVRH. Neaplikované.** Recovery sprint má guardrail „žiadne DDL, žiadne migrácie" —
takže táto migrácia je napísaná, nie spustená. Rozhodni sa samostatne.

## Čo je teraz

Schválené metriky (`ig_reels_video_view_total_time` + odvodené `actual_video_duration_sec`
a `avg_watch_ratio`) sa zapisujú do **`chs_posts.engagement`** (jsonb) — tam DDL netreba.
`/api/recovery/report` ich odtiaľ číta a zobrazuje.

## Čo to obmedzuje

`chs_posts.engagement` drží **jednu, priebežne prepisovanú** hodnotu. Snapshoty
(`chs_post_performance_snapshots`) sú naopak nemenné checkpointy na 24h / 72h / 7d —
a to je jediné miesto, kde sa dá odpovedať na otázku *„ako sa watch ratio vyvíjalo medzi
24h a 7d"*. Dnes to nevieme: v jsonbe je vždy len posledný stav.

`actual_video_duration_sec` je nemenná (publikovaný súbor sa nemení), takže tá stratou
histórie netrpí. `avg_watch_ratio` áno — mení sa s každým importom.

## Navrhovaná migrácia

```sql
-- supabase/migrations/20260904_watch_retention_snapshots.sql
alter table chs_post_performance_snapshots
  add column if not exists video_view_total_time_sec numeric,
  add column if not exists actual_video_duration_sec numeric,
  add column if not exists avg_watch_ratio numeric;

comment on column chs_post_performance_snapshots.avg_watch_ratio is
  'avg_watch_time_sec / actual_video_duration_sec. NOT clamped: ig_reels_avg_watch_time is averaged over reaching accounts, not plays, so replays can push it above 1.';
```

Všetky tri `numeric` a nullable — rovnaká posture ako zvyšok tabuľky, kde `NULL` znamená
„nemerané" a nie „nula".

## Nadväzný kód (jednoriadkové zmeny)

- `lib/creativeIntelligence/performanceSnapshots.ts` → `SnapshotMetricsInput` + `metricRow()`
  o tri polia; hodnoty už v merged engagement objekte sú, takže sa len prenesú.
- `lib/recovery/report.ts` → `SnapshotRow` o tri polia; `readWatchRetention()` by potom
  čítalo z horizontu namiesto z engagementu.

## Bez backfillu

Guardrail sprintu zakazuje backfill a nie je to ani možné retroaktívne: dnešný ratio je
dnešný, nie 24-hodinový. Historické hodnoty som **zmeral, ale nezapísal** — sú v
`docs/RECOVERY-REELS.md` ako evidence tabuľka, nie v DB.

## Odporúčanie

Nespúšťať teraz. Zbieraj metriku v jsonbe počas recovery sprintu; ak sa ukáže, že sa
oplatí sledovať krivku ratio medzi horizontmi, migrácia je pripravená a je aditívna
(žiadny existujúci stĺpec sa nemení, žiadny riadok neprepisuje).

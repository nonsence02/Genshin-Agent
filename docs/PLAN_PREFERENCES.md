# Plan Preferences

Plan preferences let users constrain or steer deterministic resin plans without changing imported inventory, normalized game knowledge, or planner requirement math.

## Defaults

- `planStyle`: `resin_efficient`
- `days`: `7`
- `dailyResinBudget`: `180`
- `fragileResin.allowed`: `false`
- `fragileResin.resinPerFragile`: `60`
- `weeklyBosses.discountedClaimsUsedThisWeek`: `0`
- `crafting.useCrafting`: `true`
- `crafting.allowDustOfAzoth`: `false`
- `crafting.allowDreamSolvent`: `false`

## Supported Preferences

- `availability.blockedDaysOfWeek`: weekdays that receive `resinBudget = 0` and no resin tasks.
- `availability.blockedDates`: exact `YYYY-MM-DD` dates that receive no resin tasks.
- `availability.maxResinByDate` and `maxResinByDayOfWeek`: cap the resin budget for specific dates or weekdays.
- `sourceFilters.excludedSourceTypes`: moves matching source groups to `excludedTasks`.
- `sourceFilters.excludedSourceKeys`: moves matching source groups to `excludedTasks`.
- `manualTaskExclusions`: excludes matching materials, source keys, or source types with an optional reason.
- `weeklyBosses.discountedClaimsUsedThisWeek`: affects weekly boss resin cost.
- `weeklyBosses.alreadyClaimedSourceKeys`: skips those weekly bosses.
- `weeklyBosses.blockedWeeklyBossSourceKeys`: skips those weekly bosses.
- `fragileResin`: when allowed, v1 greedily adds fragile resin to early days with remaining resin tasks.
- `planStyle`: accepted values are `fastest`, `resin_efficient`, and `low_effort`.

## Compatibility

`POST /planner/character/plan` still accepts legacy top-level fields such as `days`, `dailyResinBudget`, `currentResin`, `discountedWeeklyBossClaimsUsed`, and crafting flags. If `preferences` also provides the equivalent value, `preferences` wins.

## Current Limitations

- no drag-and-drop calendar;
- no persistent saved preferences;
- no multi-goal optimization;
- no map routing or pathfinding;
- no agent chat;
- `low_effort` is a simple deterministic sort/warning in v1, not a full calendar compaction optimizer.

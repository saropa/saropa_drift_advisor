# 002 - Blanket DateTime Index Suggestion Produces Mass False Positives

## Problem

The `index-suggestion` rule flags every `DateTimeColumn` with "often used in ORDER BY or range queries" and suggests creating an index. This produces 40+ warnings across the project, nearly all of which are false positives. The rule has no awareness of:

1. Whether the column is actually queried (WHERE, ORDER BY, range filters)
2. Whether the column already has an index
3. Whether the table size justifies an index (mobile SQLite tables rarely exceed thousands of rows)

## Impact

Developers learn to ignore the rule entirely, which defeats the purpose. Legitimate index suggestions (if any) get lost in the noise.

## False Positive Categories

### Audit timestamps never queried (largest group)

These `created_at` / `updated_at` columns exist purely as write-only metadata. No Drift query in the codebase filters, sorts, or does range queries on them:

| Table | Column | File |
|---|---|---|
| emergency_services | created_at | static_data/country/emergency_service_table.dart |
| currency_rates | created_at | system_data/currency_rate_table.dart |
| provider_auths | created_at | system_data/provider_auth_table.dart |
| provider_auths | updated_at | system_data/provider_auth_table.dart |
| public_holidays | created_at | system_data/public_holiday_table.dart |
| public_holidays | updated_at | system_data/public_holiday_table.dart |
| user_permissions | created_at | system_data/user_permission_table.dart |
| user_permissions | updated_at | system_data/user_permission_table.dart |
| wikipedia_articles | created_at | system_data/wikipedia_article_table.dart |
| wikipedia_articles | updated_at | system_data/wikipedia_article_table.dart |
| calendar_events | created_at | user_data/calendar_event_table.dart |
| coaching_sessions | created_at | user_data/coaching_session_table.dart |
| connections | created_at | user_data/connection_table.dart |
| contact_points | created_at | user_data/contact_points_table.dart |
| contact_groups | created_at | user_data/contact_group_table.dart |
| contact_groups | updated_at | user_data/contact_group_table.dart |
| family_groups | created_at | user_data/family_group_table.dart |
| family_groups | updated_at | user_data/family_group_table.dart |
| organizations | created_at | user_data/organization_table.dart |
| organizations | updated_at | user_data/organization_table.dart |
| user_badges | created_at | user_data/user_badge_table.dart |
| user_env_overrides | created_at | user_data/user_env_override_table.dart |
| user_env_overrides | updated_at | user_data/user_env_override_table.dart |
| user_preferences | created_at | user_data/user_preference_table.dart |
| user_preferences | updated_at | user_data/user_preference_table.dart |
| user_public_private_keys | created_at | user_data/user_public_private_keys_table.dart |
| user_public_private_keys | updated_at | user_data/user_public_private_keys_table.dart |
| contacts | updated_at | user_data/contact_table.dart |

### Status-flag datetimes never queried

These datetime columns encode a boolean state (non-null = active) but are never used in queries on these specific tables:

| Table | Column | File |
|---|---|---|
| contact_groups | favorite_at | user_data/contact_group_table.dart |
| contact_groups | emergency_at | user_data/contact_group_table.dart |
| family_groups | favorite_at | user_data/family_group_table.dart |
| family_groups | emergency_at | user_data/family_group_table.dart |
| organizations | favorite_at | user_data/organization_table.dart |
| organizations | emergency_at | user_data/organization_table.dart |
| you_tube_api_cache | favorite_at | user_data/youtube_api_cache_table.dart |
| you_tube_api_cache | emergency_at | user_data/youtube_api_cache_table.dart |
| contacts | un_favorite_at | user_data/contact_table.dart |
| contacts | sync_prompt_state_changed_at | user_data/contact_table.dart |

### Other unqueried datetime columns

| Table | Column | File |
|---|---|---|
| connections | last_shared_at | user_data/connection_table.dart |
| contact_avatar_history | saved_at | user_data/contact_avatar_history_table.dart |
| grid_menu_shortcuts | added_at | user_data/grid_menu_shortcut_table.dart |
| quick_launch_orders | added_at | user_data/quick_launch_order_table.dart |
| user_badges | notified_at | user_data/user_badge_table.dart |
| wikimedia_births | fetched_at | user_data/wikimedia_birth_table.dart |
| you_tube_api_cache | publish_date | user_data/youtube_api_cache_table.dart |
| you_tube_api_cache | viewed_at | user_data/youtube_api_cache_table.dart |
| you_tube_api_cache | hidden_at | user_data/youtube_api_cache_table.dart |

## Suggested Fix

Options, from least to most effort:

1. **Reduce severity to hint/info** -- stop treating these as warnings. They're suggestions, not problems.
2. **Add a suppression annotation** -- let developers mark columns as `// drift_advisor:no_index` to acknowledge and silence.
3. **Check for existing indexes** -- if the column already has a `@TableIndex`, don't re-suggest.
4. **Static query analysis** -- only suggest indexes on columns that appear in WHERE/ORDER BY/GROUP BY clauses in the codebase's DAO/IO files. This is the correct fix but highest effort.

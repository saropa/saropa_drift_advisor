# 001 - BoolColumn Misclassified as DateTimeColumn

## Problem

The `index-suggestion` rule flags `calendar_events.is_free_time` as a "Date/time column" and suggests a datetime index on it. The column is actually a `BoolColumn`, not a `DateTimeColumn`.

## Source

`calendar_event_table.dart`, line 82:

```dart
BoolColumn get isFreeTime => boolean().nullable()();
```

## Linter Output

```
calendar_events.is_free_time: Date/time column -- often used in ORDER BY or range queries
Suggested fix: CREATE INDEX idx_calendar_events_is_free_time ON "calendar_events"("is_free_time");
```

## Expected Behavior

The rule should not flag BoolColumns. The column type detection logic is incorrectly identifying `is_free_time` as a datetime column, possibly due to a name-pattern match or a type-resolution failure.

## Root Cause Hypothesis

The column type classifier may be matching on a naming heuristic (e.g. suffix patterns) rather than resolving the actual Drift column type from the getter return type. `isFreeTime` returns `BoolColumn`, which should be unambiguously boolean.

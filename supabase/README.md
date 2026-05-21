# Supabase — Database Setup

## Table: `portfolio_snapshots`

Stores one portfolio JSON blob per authenticated user.

| Column           | Type        | Notes                                   |
|------------------|-------------|-----------------------------------------|
| `id`             | `uuid`      | Primary key, auto-generated             |
| `user_id`        | `uuid`      | References `auth.users(id)`, on delete cascade |
| `portfolio_json` | `jsonb`     | Full portfolio snapshot (schema-versioned JSON) |
| `created_at`     | `timestamptz` | Set on insert                         |
| `updated_at`     | `timestamptz` | Auto-updated by trigger on every update |

---

## Setup instructions

### 1 — Run the migration script

Open **Supabase Dashboard → SQL editor** and run the full contents of:

```
supabase/portfolio_snapshots.sql
```

This is safe to re-run; all operations are idempotent.

---

### 2 — Verify Row Level Security is active

In **Supabase Dashboard → Table Editor → portfolio_snapshots**, confirm:

- **RLS enabled** badge is shown

Or via SQL:

```sql
select relname, relrowsecurity
from pg_class
where relname = 'portfolio_snapshots';
-- relrowsecurity should be true
```

---

### 3 — Verify all four policies exist

```sql
select policyname, cmd, roles, qual
from pg_policies
where tablename = 'portfolio_snapshots'
order by policyname;
```

Expected result:

| policyname                            | cmd    | roles           |
|---------------------------------------|--------|-----------------|
| `portfolio_snapshots_delete_own`      | DELETE | `{authenticated}` |
| `portfolio_snapshots_insert_own`      | INSERT | `{authenticated}` |
| `portfolio_snapshots_select_own`      | SELECT | `{authenticated}` |
| `portfolio_snapshots_update_own`      | UPDATE | `{authenticated}` |

---

## Row Level Security policy summary

All four policies restrict access so that each authenticated user can only touch their own rows.

### SELECT
```sql
using (auth.uid() = user_id)
```
Users can only read their own snapshot.

### INSERT
```sql
with check (auth.uid() = user_id)
```
Users can only insert a row where `user_id` matches their own UID.

### UPDATE
```sql
using (auth.uid() = user_id)
with check (auth.uid() = user_id)
```
Users can only update their own snapshot row. The `with check` prevents re-assigning ownership to another user.

### DELETE
```sql
using (auth.uid() = user_id)
```
Users can only delete their own snapshot.

---

## Notes

- The table has a `unique (user_id)` constraint, so each user has at most one snapshot row.
- The app uses `upsert` with `onConflict: "user_id"` to write snapshots, so no manual insert/update distinction is needed from the client.
- The `updated_at` trigger fires automatically on every update; no need to set it from the client.
- The `anon` role has no access. Unauthenticated requests are blocked by the RLS policies (`to authenticated`).


-- Removing an exercise from a plan archives it instead of deleting the row.
-- training_logs references training_exercises with ON DELETE CASCADE, so a
-- hard delete silently wiped the exercise's entire training history.
alter table training_exercises
  add column if not exists is_active boolean not null default true;

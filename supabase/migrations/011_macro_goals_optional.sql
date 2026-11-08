-- Macro goals become optional: null means "derive from calorie goal and body
-- weight" (src/lib/macro-calc.ts). Before, the columns were NOT NULL with
-- defaults of 150 / 250 / 80 g that nobody had chosen, and the app ignored
-- them entirely; honouring them as-is would replace the formula with numbers
-- that do not even add up to the calorie goal.

alter table user_profiles
  alter column protein_goal drop not null,
  alter column protein_goal drop default,
  alter column carbs_goal drop not null,
  alter column carbs_goal drop default,
  alter column fat_goal drop not null,
  alter column fat_goal drop default;

-- Rows still holding the untouched defaults go back to automatic.
update user_profiles
set protein_goal = null, carbs_goal = null, fat_goal = null
where protein_goal = 150 and carbs_goal = 250 and fat_goal = 80;

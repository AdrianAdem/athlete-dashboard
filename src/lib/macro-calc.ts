/**
 * Calculate macro targets based on calorie goal and body weight.
 *
 * Standard split:
 * - Protein: 2g per kg body weight
 * - Fat: 25% of calories (9 kcal/g)
 * - Carbs: remaining calories (4 kcal/g)
 */
export function calculateMacros(calorieGoal: number, bodyWeightKg: number) {
  const proteinG = Math.round(bodyWeightKg * 2);
  const proteinCal = proteinG * 4;

  const fatCal = Math.round(calorieGoal * 0.25);
  const fatG = Math.round(fatCal / 9);

  const carbsCal = calorieGoal - proteinCal - fatCal;
  const carbsG = Math.round(Math.max(carbsCal, 0) / 4);

  return {
    calories: calorieGoal,
    protein: proteinG,
    carbs: carbsG,
    fat: fatG,
  };
}

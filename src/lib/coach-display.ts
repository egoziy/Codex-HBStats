type CoachAssignmentLike = {
  id: string;
  coachNameEn: string;
  coachNameHe?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  createdAt?: Date | string;
};

export function formatCoachName(
  coach:
    | CoachAssignmentLike
    | {
        coach?: string | null;
        coachHe?: string | null;
      }
    | null
    | undefined
) {
  if (!coach) return '';

  if ('coachNameEn' in coach) {
    return coach.coachNameHe || coach.coachNameEn || '';
  }

  return coach.coachHe || coach.coach || '';
}

export function getLatestCoachAssignment<T extends CoachAssignmentLike>(assignments: T[]) {
  return [...assignments].sort((left, right) => {
    const rightDate = new Date(right.startDate || right.createdAt || 0).getTime();
    const leftDate = new Date(left.startDate || left.createdAt || 0).getTime();
    return rightDate - leftDate;
  })[0] || null;
}

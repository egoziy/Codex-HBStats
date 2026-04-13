const EVENT_TRANSLATIONS: Record<string, string> = {
  GOAL: 'שער',
  ASSIST: 'בישול',
  YELLOW_CARD: 'כרטיס צהוב',
  RED_CARD: 'כרטיס אדום',
  SUBSTITUTION_IN: 'חילוף נכנס',
  SUBSTITUTION_OUT: 'חילוף יוצא',
  OWN_GOAL: 'שער עצמי',
  PENALTY_GOAL: 'שער בפנדל',
  PENALTY_MISSED: 'פנדל מוחמץ',
  GOAL_DISALLOWED: 'גול נפסל',
  INJURY: 'פציעה',
};

const EVENT_ICON_PATHS: Record<string, string> = {
  GOAL: '/Icons/event-goal.svg',
  ASSIST: '/Icons/event-assist.svg',
  YELLOW_CARD: '/Icons/event-yellow-card.svg',
  RED_CARD: '/Icons/event-red-card.svg',
  SUBSTITUTION_IN: '/Icons/event-sub-in.svg',
  SUBSTITUTION_OUT: '/Icons/event-sub-out.svg',
  OWN_GOAL: '/Icons/event-own-goal.svg',
  PENALTY_GOAL: '/Icons/event-penalty-goal.svg',
  PENALTY_MISSED: '/Icons/event-penalty-missed.svg',
  GOAL_DISALLOWED: '/Icons/event-goal-disallowed.svg',
  INJURY: '/Icons/event-injury.svg',
};

export function getEventDisplayLabel(eventType: string | null | undefined) {
  if (!eventType) return 'אירוע';
  return EVENT_TRANSLATIONS[eventType] || eventType;
}

export function getEventIconPath(eventType: string | null | undefined) {
  if (!eventType) return null;
  return EVENT_ICON_PATHS[eventType] || null;
}

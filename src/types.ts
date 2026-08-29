export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: string;
  lastActiveAt: string;
}

export type JournalMood = 'reflective' | 'energized' | 'calm' | 'challenged' | 'grateful' | 'focused';

export interface JournalMessage {
  id: string;
  entryId: string;
  userId: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  modelUsed?: string;
}

export interface JournalEntry {
  id: string;
  userId: string;
  title: string;
  preview: string;
  summary?: string;
  mood: JournalMood;
  tags: string[];
  turnCount: number;
  createdAt: string;
  updatedAt: string;
  messages?: JournalMessage[];
}

export interface RecurringTheme {
  theme: string;
  frequency: 'high' | 'moderate' | 'emerging';
  description: string;
}

export interface MoodPatternAnalysis {
  dominantMood: string;
  stabilityScore: number; // 1 - 10
  observations: string;
}

export interface GrowthGoal {
  goal: string;
  status: 'in_progress' | 'achieved' | 'stalled';
  context: string;
}

export interface GrowthBlocker {
  blocker: string;
  suggestedRemedy: string;
}

export interface ActionableStep {
  step: string;
  priority: 'high' | 'medium';
  rationale: string;
}

export interface GrowthInsight {
  id: string;
  userId: string;
  generatedAt: string;
  timeframeDays: number; // 7, 30, or 90
  timeframeLabel: string;
  entriesAnalyzedCount: number;
  recurringThemes: RecurringTheme[];
  moodPatterns: MoodPatternAnalysis;
  goals: GrowthGoal[];
  blockers: GrowthBlocker[];
  actionableNextSteps: ActionableStep[];
  weeklyReflection: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
}

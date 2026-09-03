// Re-exported here (rather than importing @/types/voiie directly
// everywhere) so the dashboard's own response shapes -- which nest the
// shared types -- have one place to live.
import type { LeadAnswers, VoiieLead, VoiieMessage, VoiieQuestion } from "@/types/voiie";

export type { VoiieLead, VoiieMessage };

export interface ConsultationState {
  answers: LeadAnswers;
  currentQuestion: number;
  completedAt: string | null;
}

export interface DemoProjectInfo {
  id: string;
  custom_domain: string | null;
  custom_domain_status: string;
  views: number;
}

export interface LeadDetail {
  lead: VoiieLead;
  messages: VoiieMessage[];
  consultation: ConsultationState;
  project: DemoProjectInfo | null;
}

export type { VoiieQuestion };

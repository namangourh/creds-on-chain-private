export interface SkillReport {
  skills: string[];
  summary: string;
  score: number;
}

export interface BrowseProfile {
  wallet: string;
  cid: string;
  price: number | null;
  skillReport: SkillReport;
}

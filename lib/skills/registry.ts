export const skills = {
  "episodic-recall": {
    id: "episodic-recall",
    title: "Episodic recall",
  },
} as const;

export type SkillId = keyof typeof skills;

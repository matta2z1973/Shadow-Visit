export type Token = {
  page: number;
  x: number;
  y: number;
  w: number;
  str: string;
};

export type ExtractedBlock = {
  cohortCode: string; // 'US', '5', '6', '7-8'
  dayType: "green" | "gold" | "a_day" | "b_day" | "c_day";
  label: string;
  startTime: string; // 'HH:MM:SS'
  endTime: string; // 'HH:MM:SS'
  sortOrder: number;
  isCoverable: boolean;
};

export type ParseResult = {
  blocks: ExtractedBlock[];
  warnings: string[];
};

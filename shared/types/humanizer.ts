export type Tone = 'natural' | 'formal' | 'casual' | 'academic' | 'persuasive';
export type Strength = 'light' | 'medium' | 'strong';

export interface HumanizeSettings {
  tone: Tone;
  strength: Strength;
  preserveMeaning: boolean;
  variety: number;
}

export interface TextAnalysis {
  characters: number;
  words: number;
  sentences: number;
  avgSentenceLength: number;
  lexicalDiversity: number;
}

export interface HumanizeResult {
  model: string;
  settings: HumanizeSettings;
  inputAnalysis: TextAnalysis;
  outputAnalysis: TextAnalysis;
  output: string;
  filename?: string;
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function countSentences(text: string): number {
  const matches = text.match(/[^.!?]+[.!?]+/g);
  return matches?.length ?? (text.trim() ? 1 : 0);
}

export function averageSentenceLength(text: string): number {
  const sentences = countSentences(text);
  if (!sentences) return 0;
  return Number((countWords(text) / sentences).toFixed(2));
}

export function lexicalDiversity(text: string): number {
  const words = text
    .toLowerCase()
    .match(/[\p{L}\p{N}']+/gu) ?? [];

  if (!words.length) return 0;

  const unique = new Set(words);
  return Number((unique.size / words.length).toFixed(3));
}

export function analyzeText(text: string) {
  return {
    characters: text.length,
    words: countWords(text),
    sentences: countSentences(text),
    avgSentenceLength: averageSentenceLength(text),
    lexicalDiversity: lexicalDiversity(text)
  };
}

// Deterministic bag-of-words embeddings for integration tests: texts that
// share words get high cosine similarity, unrelated texts ~0.
const DIMENSIONS = 768;

function hashWord(word: string): number {
  let hash = 2166136261;
  for (let i = 0; i < word.length; i++) {
    hash ^= word.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % DIMENSIONS;
}

export function fakeEmbedding(text: string): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const word of words) {
    if (word.length < 3) continue;
    vector[hashWord(word.replace(/s$/, ""))] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

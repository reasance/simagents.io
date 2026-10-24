import { expect, test } from 'bun:test';
import { LLM_CATALOG, getModelCatalogEntry } from '../llm-catalog';

test('every catalog model cites a vendor source and a verification date', () => {
  for (const provider of LLM_CATALOG) {
    for (const model of provider.models) {
      expect(model.source).toStartWith('https://');
      expect(model.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  }
});

test('model ids are unique per provider and each default model is a current entry', () => {
  for (const provider of LLM_CATALOG) {
    const ids = provider.models.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
    if (provider.models.length === 0) continue;
    const fallback = getModelCatalogEntry(provider.id, provider.defaultModelId);
    expect(fallback).toBeDefined();
    expect(fallback?.legacy).toBeUndefined();
  }
});

test('effort defaults are among the levels the model accepts', () => {
  for (const provider of LLM_CATALOG) {
    for (const model of provider.models) {
      if (model.reasoning.kind !== 'effort') continue;
      expect(model.reasoning.levels.length).toBeGreaterThan(0);
      expect(model.reasoning.levels).toContain(model.reasoning.default!);
    }
  }
});

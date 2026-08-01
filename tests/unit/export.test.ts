import { describe, expect, it } from 'vitest';
import { createStandaloneReportHtml, serializeCsv, serializeJson } from '../../src/core/exportService.js';

describe('exports', () => {
  it('escapes CSV and neutralizes spreadsheet formulas', () => {
    const csv = serializeCsv([{ name: '=HYPERLINK("https://invalid")', note: 'a,b', amount: 12 }]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('"a,b"');
  });

  it('creates JSON and standalone HTML without external resources', () => {
    expect(serializeJson([{ ok: true }])).toBe('[\n  {\n    "ok": true\n  }\n]\n');
    const page = { id: 'p', name: '<Page>', filters: [], visuals: [{ id: 'v', title: 'Sales', type: 'kpi' as const, tableId: 't', aggregation: 'sum' as const, columns: [], limit: 100, width: 6, height: 4 }] };
    const html = createStandaloneReportHtml(page, [{ visualId: 'v', columns: [], rows: [{ value: 42 }], truncated: false }], 'Retail');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('&lt;Page&gt;');
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+href=/);
  });
});

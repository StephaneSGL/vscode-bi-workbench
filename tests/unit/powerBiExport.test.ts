import { describe, expect, it } from 'vitest';
import {
  quoteTmdlIdentifier,
  safePowerBiSegment,
  toPowerBiDataType,
  translateSqlMeasureToDax
} from '../../src/core/powerBiExportService.js';

describe('Power BI export helpers', () => {
  it('creates Windows-safe, readable artifact names', () => {
    expect(safePowerBiSegment('Résumé / CA: 2026*', 'Project')).toBe('Resume-CA-2026');
    expect(safePowerBiSegment('CON', 'Project')).toBe('BI-CON');
    expect(safePowerBiSegment('  ...  ', 'Project')).toBe('Project');
  });

  it('quotes TMDL identifiers only when necessary', () => {
    expect(quoteTmdlIdentifier('Sales')).toBe('Sales');
    expect(quoteTmdlIdentifier('Sales Amount')).toBe("'Sales Amount'");
    expect(quoteTmdlIdentifier("Director's Sales")).toBe("'Director''s Sales'");
  });

  it('maps DuckDB scalar types to Power BI types', () => {
    expect(toPowerBiDataType('BIGINT')).toBe('int64');
    expect(toPowerBiDataType('DECIMAL(18,2)')).toBe('double');
    expect(toPowerBiDataType('TIMESTAMP WITH TIME ZONE')).toBe('dateTime');
    expect(toPowerBiDataType('BOOLEAN')).toBe('boolean');
    expect(toPowerBiDataType('VARCHAR')).toBe('string');
  });

  it('translates only conservative DuckDB measures to DAX', () => {
    const columns = new Map([['amount', 'Revenue'], ['customer', 'Customer']]);
    expect(translateSqlMeasureToDax('SUM("amount")', 'Sales model', columns)).toEqual({
      dax: "SUM('Sales model'[Revenue])"
    });
    expect(translateSqlMeasureToDax('AVG(amount)', 'Sales model', columns)).toEqual({
      dax: "AVERAGE('Sales model'[Revenue])"
    });
    expect(translateSqlMeasureToDax('COUNT(*)', 'Sales model', columns)).toEqual({
      dax: "COUNTROWS('Sales model')"
    });
    expect(translateSqlMeasureToDax('COUNT(DISTINCT "customer")', 'Sales model', columns).dax)
      .toBe("COUNTROWS(FILTER(VALUES('Sales model'[Customer]), NOT ISBLANK('Sales model'[Customer])))");
    expect(translateSqlMeasureToDax('SUM("amount") / 100', 'Sales model', columns).dax).toBeUndefined();
  });
});

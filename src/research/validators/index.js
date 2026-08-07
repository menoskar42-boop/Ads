// Validator orchestrator: runs every check over a parsed dataset and returns
// one flat findings list plus the per-section detail each validator produced.
// The order here is the order the report presents sections in.
'use strict';

const { profileColumns } = require('../parser');
const { bindRules } = require('../rules');

const missing = require('./missing');
const duplicates = require('./duplicates');
const formulas = require('./formulas');
const ranges = require('./ranges');
const units = require('./units');
const consistency = require('./consistency');
const outliers = require('./outliers');
const precision = require('./precision');
const readiness = require('./readiness');

/**
 * @param dataset  from parseDataset()
 * @param custom   { rules?, formulas?, consistency? } admin-defined extensions
 * @returns { findings, sections, profile, boundRules }
 */
function runAll(dataset, custom = {}) {
  const profile = profileColumns(dataset);
  const boundRules = bindRules(dataset.columns, custom.rules || []);

  const m = missing.run(dataset);
  const d = duplicates.run(dataset, boundRules);
  const f = formulas.run(dataset, boundRules, custom.formulas || []);
  const r = ranges.run(dataset, boundRules);
  const u = units.run(dataset, boundRules);
  const c = consistency.run(dataset, boundRules, custom.consistency || []);
  const o = outliers.run(dataset, profile, boundRules);
  const p = precision.run(dataset, profile, boundRules);
  const rd = readiness.run(dataset, profile);

  const findings = [].concat(
    m.findings, d.findings, f.findings, r.findings,
    u.findings, c.findings, o.findings, p.findings, rd.findings,
  );

  return {
    findings,
    profile,
    boundRules,
    sections: {
      missing: m.perColumn,
      duplicates: d.summary,
      formulas: f.checked,
      ranges: r.perField,
      outliers: o.perColumn,
      precision: p.perColumn,
      readiness: rd.notes,
    },
  };
}

module.exports = { runAll };

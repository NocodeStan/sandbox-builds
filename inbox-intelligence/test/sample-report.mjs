// Writes docs/sample-report.html: the weekly brief produced from the fixture week (see test/pipeline.mjs).
// Usage: npm run sample
import { writeFileSync } from 'node:fs';
import { runReportLane } from './pipeline.mjs';

const { report } = runReportLane({ cfg: { owner: { name: 'Stan', role: 'Senior AI architect and advisor to C-suite and executive leadership', focus: ['AI strategy', 'automation', 'agentic systems'] } } });
writeFileSync(new URL('../docs/sample-report.html', import.meta.url), report.html);
console.log(`${report.subject}\n${JSON.stringify(report.stats)}`);

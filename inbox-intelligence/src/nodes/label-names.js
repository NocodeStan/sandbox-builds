// @include core
// One item per IQ label; "Create Label" is idempotent (Gmail answers 409 for labels that already exist).
if (!CFG.applyLabels) return [];
return CFG.allLabels.map((name) => ({ json: { name } }));

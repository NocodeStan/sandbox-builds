// One item per Glofox branch; the next node pages through that branch's member list.
const { cfg } = $('Config').first().json;
return cfg.branches.map((b) => ({ json: { branch: b.id, name: b.name } }));

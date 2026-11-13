// One item per 10-row Activity Log insert of newly verified purchases.
return $('Plan Member Flags').first().json.logChunks.map((c) => ({ json: c }));

return $input.all().flatMap((item) => (item.json.actions || []).map((a) => ({ json: a })));

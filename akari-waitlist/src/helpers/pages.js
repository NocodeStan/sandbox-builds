function htmlPage(title, bodyHtml, extraHead = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} · ${esc(CFG.brandName)}</title>${extraHead}
<style>
body{margin:0;background:#f4f1ec;font-family:Helvetica,Arial,sans-serif;color:#1f1d1a}
main{max-width:520px;margin:0 auto;padding:40px 16px}
.card{background:#fff;border-radius:10px;padding:28px}
.brand{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8a7f72;margin:0 0 12px}
h1{font-size:22px;margin:0 0 12px}
p{line-height:1.55}
.muted{color:#5b544b;font-size:14px}
.note{background:#fbf3e4;border-radius:6px;padding:10px 12px;font-size:14px}
label{display:block;font-size:14px;margin:16px 0 6px}
textarea{width:100%;box-sizing:border-box;min-height:84px;border:1px solid #c9c1b6;border-radius:6px;padding:10px;font:inherit}
button,.button{display:block;width:100%;box-sizing:border-box;margin-top:18px;padding:13px 16px;border:0;border-radius:6px;background:#1f1d1a;color:#fff;font-size:16px;text-align:center;text-decoration:none;cursor:pointer}
</style></head><body><main><div class="card"><p class="brand">${esc(CFG.brandName)}</p><h1>${esc(title)}</h1>${bodyHtml}</div></main></body></html>`;
}

function redirectPage(url, title, message) {
  return htmlPage(
    title,
    `<p>${esc(message)}</p><a class="button" href="${esc(url)}">Continue to signup</a>`,
    `<meta http-equiv="refresh" content="1;url=${esc(url)}">`,
  );
}

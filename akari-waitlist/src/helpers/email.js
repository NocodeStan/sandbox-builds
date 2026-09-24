function emailLayout(bodyHtml) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ec;font-family:Helvetica,Arial,sans-serif;color:#1f1d1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px">
<tr><td style="padding:28px 28px 4px 28px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8a7f72">${esc(CFG.brandName)}</td></tr>
<tr><td style="padding:8px 28px 28px 28px;font-size:16px;line-height:1.55">${bodyHtml}</td></tr>
</table></td></tr></table></body></html>`;
}

function btn(href, label, primary = false) {
  const style = primary
    ? 'background:#1f1d1a;color:#ffffff;border:1px solid #1f1d1a'
    : 'background:#ffffff;color:#1f1d1a;border:1px solid #c9c1b6';
  return `<a href="${esc(href)}" style="display:block;${style};text-decoration:none;text-align:center;padding:12px 16px;border-radius:6px;margin:8px 0;font-size:15px">${esc(label)}</a>`;
}

function respondLink(token, action) {
  return `${CFG.publicWebhookBase}/respond?t=${encodeURIComponent(token)}&a=${action}`;
}

function inviteEmail(e, token, expires) {
  const q = `${e.membership} membership at ${e.location}`;
  const until = fmtTime(expires);
  const html = emailLayout(`
<p>Hi ${esc(firstName(e.name))},</p>
<p>Good news — a <strong>${esc(q)}</strong> has opened up, and you're next in line.</p>
<p>We're holding it for you for ${CFG.holdHours} hours, until <strong>${esc(until)}</strong>.</p>
${btn(respondLink(token, 'yes'), 'Yes — claim my spot', true)}
${btn(respondLink(token, 'tour'), "I'd like a tour first")}
${btn(respondLink(token, 'notnow'), 'Not right now — keep me on the list')}
${btn(respondLink(token, 'no'), "I'm no longer interested")}
<p style="font-size:14px;color:#5b544b">Want to see the space before you commit? Choose “tour first” and we'll hold your spot while we arrange it.</p>
<p style="font-size:14px;color:#5b544b">Questions? Just reply to this email.</p>`);
  const text = `Hi ${firstName(e.name)},

A ${q} has opened up and you're next in line. We're holding it for you until ${until}.

Yes, claim my spot: ${respondLink(token, 'yes')}
I'd like a tour first: ${respondLink(token, 'tour')}
Not right now, keep me on the list: ${respondLink(token, 'notnow')}
I'm no longer interested: ${respondLink(token, 'no')}

Questions? Just reply to this email.`;
  return { to: e.email, name: e.name, subject: `Your ${e.membership} spot at ${e.location} is open — held until ${until}`, html, text };
}

function sendgridPayload(m) {
  const list = (Array.isArray(m.to) ? m.to : [m.to]).filter(Boolean);
  let to = list.map((email) => (m.name && list.length === 1 ? { email, name: m.name } : { email }));
  let subject = m.subject;
  if (CFG.testRecipient) {
    subject = `[TEST → ${list.join(', ')}] ${subject}`;
    to = [{ email: CFG.testRecipient }];
  }
  return {
    personalizations: [{ to }],
    from: { email: CFG.fromEmail, name: CFG.fromName },
    reply_to: { email: CFG.replyToEmail || CFG.fromEmail },
    subject,
    content: [
      { type: 'text/plain', value: m.text },
      { type: 'text/html', value: m.html },
    ],
    // Click tracking would rewrite the response links; keep them direct.
    tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } },
    mail_settings: { sandbox_mode: { enable: !!CFG.sandboxMode } },
  };
}

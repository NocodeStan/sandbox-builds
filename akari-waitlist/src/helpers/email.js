function emailLayout(bodyHtml, preheader) {
  // Hidden preheader: shows as the preview snippet in the inbox list without appearing in the body.
  // The repeated &zwnj;&nbsp; padding stops the client pulling real body text in after a short preheader.
  const pre = preheader
    ? `<div style="display:none;font-size:1px;color:#f4f1ec;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${esc(preheader)}${'&zwnj;&nbsp;'.repeat(40)}</div>`
    : '';
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ec;font-family:Helvetica,Arial,sans-serif;color:#1f1d1a">
${pre}<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
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
  const until = fmtTime(expires);
  const price = CFG.priceByTier && CFG.priceByTier[e.membership];
  const costLine = price
    ? `The cost for your membership will be $${price}/month, and additional membership details can be found on our membership page here ${CFG.membershipPageUrl}.`
    : `Additional membership details, including pricing, can be found on our membership page here ${CFG.membershipPageUrl}.`;
  const html = emailLayout(`
<p>Hi ${esc(firstName(e.name))},</p>
<p>We really appreciate your patience during the waitlist process for the ${esc(e.membership)} membership at Akari ${esc(e.location)}. We are in the process of opening more memberships this month, and we would love to have you join us!</p>
<p>${esc(costLine)} We'll hold it for you until <strong>${esc(until)}</strong>. After that it goes to the next person in line.</p>
<p>Please let us know how you would like to proceed below:</p>
${btn(respondLink(token, 'yes'), 'Sign up', true)}
${btn(respondLink(token, 'tour'), 'Tour first')}
<p style="font-size:13px;color:#8a7f72;margin:-4px 0 12px">We'll find a time for you to come see the space before you commit.</p>
${btn(respondLink(token, 'notnow'), 'Not ready yet')}
<p style="font-size:13px;color:#8a7f72;margin:-4px 0 12px">We'll keep you on the waitlist and check back in with you down the road.</p>
${btn(respondLink(token, 'no'), 'No longer interested')}
<p>If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.</p>
<p>For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.</p>
<p>We look forward to welcoming you soon!</p>
<p>Warmly,<br>Akari team</p>`, 'Your spot is available for a limited time');
  const text = `Hi ${firstName(e.name)},

We really appreciate your patience during the waitlist process for the ${e.membership} membership at Akari ${e.location}. We are in the process of opening more memberships this month, and we would love to have you join us!

${costLine} We'll hold it for you until ${until}. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: ${respondLink(token, 'yes')}
Tour first: ${respondLink(token, 'tour')} (we'll find a time for you to come see the space before you commit)
Not ready yet: ${respondLink(token, 'notnow')} (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: ${respondLink(token, 'no')}

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team`;
  return { to: e.email, name: e.name, subject: `${e.membership} Membership Now Available at Akari ${e.location}`, html, text };
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

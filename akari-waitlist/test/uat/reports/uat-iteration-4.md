# Akari Waitlist · UAT run `iteration-4`

Run 2026-10-15T20:05:16.178Z · n8n 2.40.6 · real workflow JSON, mock Airtable + SendGrid · 214 API calls · 49 emails

**104 pass · 30 fail · 2 risk · 5 open decision** across 33 scenarios

Legend: ✅ pass · ❌ fail (defect) · ⚠️ risk (works, residual risk) · ❓ open (needs a product decision)

## Findings

| | Scenario | Check | Detail |
|---|---|---|---|
| ❓ | E1 | a mistyped minimum is stopped, not just slowed (it would keep sending 10 invites every hour) | The per-run cap limits the damage to 10/hour per queue but nothing pauses the queue or alerts staff; the daily report does not flag an implausible minimum. |
| ❓ | C2 | the heads-up offers a one-click way off the list (Jack's {{remove_link}}) | no match for /a=remove\|a=leave/ in: “<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ec;font-family:Helvetica,Arial,sans-serif;color:#1f1d1a"> <div style="display:none;font-size:1px;color:#f4f1ec;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all"” |
| ❌ | R1 | status → Signed Up | expected "Signed Up", got "Invited" |
| ❌ | R1 | she is removed from her Williamsburg Daytime list automatically | expected "Removed", got "Waiting" |
| ❌ | R1 | confirmation subject: "Your Private Sign Up Link for Akari Williamsburg" | expected "Your Private Sign Up Link for Akari Williamsburg", got undefined |
| ❌ | R1 | confirmation preview: "Your Unlimited membership is ready for you" | expected "Your Unlimited membership is ready for you", got "" |
| ❌ | R1 | confirmation carries the private signup link | no match for /https:\/\/app\.glofox\.test\/signup\/wb-unl/ in: “” |
| ❌ | R1 | Unlimited wording: "we'll automatically remove you from any other Akari waitlists" | no match for /automatically remove you from any other Akari waitlists/ in: “” |
| ❌ | R2 | Ava is told her spot is held | no match for /held for you/ in: “<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"> <meta name="robots" content="noindex"><title>Please try again in a minute · Akari Sauna</title> <style> body{margin:0;background:#f4f” |
| ❌ | R2 | status → Tour Requested, notes saved | expected ["Tour Requested","Weekday evenings after 6"], got ["Invited",null] |
| ❌ | R2 | team alert: "Tour Request: Ava Romero at Akari Williamsburg" | expected "Tour Request: Ava Romero at Akari Williamsburg", got undefined |
| ❌ | R2 | alert lists email, phone, waitlist date and preferred times | no match for /stan\+11@optimizewise\.org[\s\S]*\+17185550111[\s\S]*On the waitlist since[\s\S]*Weekday evenings after 6/ in: “” |
| ❌ | R2 | alert reads naturally: "committing to an Unlimited membership" | no match for /committing to an Unlimited membership/ in: “” |
| ❌ | R2 | alert tells staff exactly what to do after the tour (Send Now) | no match for /Send Now/ in: “” |
| ❌ | R3 | Noor is told she stays on the list | no match for /still on the waitlist/ in: “<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"> <meta name="robots" content="noindex"><title>Please try again in a minute · Akari Sauna</title> <style> body{margin:0;background:#f |
| ❌ | R3 | status → Not Right Now with her reason | expected ["Not Right Now","Back in town in November"], got ["Invited",null] |
| ❓ | R3 | Jack's copy promises "we'll check back in with you down the road" — something brings Noor back to Jack's attention later | Not Right Now is a dead end: the engine never re-offers, and the daily report only shows the reason on the day it is given. |
| ❌ | R4 | status → No Longer Interested with reason | expected ["No Longer Interested","Too far from me"], got ["Invited",null] |
| ❌ | R5 | 4-Visit wording: stays on other waitlists, with a link to come off them | no match for /You'll stay on any other Akari waitlists you've joined\. If you'd rather come off them, you can remove yourself here: \S+a=leave/ in: “” |
| ❌ | R5 | the "remove me" link opens a confirmation page first | no match for /Leave your other waitlists/ in: “<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"> <meta name="robots" content="noindex"><title>Please try again in a minute · Akari Sauna</title> <style> body{margin:0;backgrou |
| ❌ | R5 | after confirming: removed from Daytime; 4-Visit signup untouched | expected ["Removed","Signed Up"], got ["Waiting","Invited"] |
| ❌ | R5 | the page says what they were removed from | no match for /Daytime at Williamsburg/ in: “<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"> <meta name="robots" content="noindex"><title>Please try again in a minute · Akari Sauna</title> <style> body{margin:0;background: |
| ❌ | R6 | the page tells them they're first in line for the next spot | no match for /first in line/ in: “<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"> <meta name="robots" content="noindex"><title>Taking you to signup · Akari Sauna</title><meta http-equiv="refresh" content="1;url=http” |
| ❌ | R6 | status → Warm (first in line) | expected "Warm", got "Signed Up" |
| ⚠️ | R7 | Airtable's 5 requests/second limit was not exceeded | 1 burst(s) tripped Airtable's 30s lockout; handled gracefully (see checks above) |
| ❌ | D1 | reasons given today are listed (Guest02 and Noor) | one or both reasons missing |
| ❓ | D1 | report layout matches Jack's template 4 (Needs attention / Last 24 hours / By location) | no match for /Invites expiring in the next 24 hours/ in: “<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ec;font-family:Helvetica,Arial,sans-serif;color:#1f1d1a"> <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px  |
| ❌ | E2 | Ava's tour hold does not time out | expected "Tour Requested", got "Warm" |
| ❌ | E2 | Guest04 (told "first in line") is re-invited straight away | invited: stan+111@optimizewise.org, stan+112@optimizewise.org |
| ❌ | E2 | Williamsburg Unlimited: no new invite while Cleo's signup awaits Jack's recount and Ava's tour holds the other spot | expected 0, got 1 |
| ❌ | S4 | the new Williamsburg Unlimited spot goes to Ben (existing member, 121 days waiting) | expected ["Ben Fischer"], got ["Maya Chen"] |
| ❌ | E4 | Ben timed out → Warm; the Williamsburg Unlimited spot goes to Maya (Ben is cooling down) | expected ["Warm",["Maya Chen"]], got ["Warm",["Jo Park"]] |
| ❌ | D2 | flags Maya's tour hold as stale (over 7 days) | no match for /Maya Chen \(Unlimited at Williamsburg\) has had a tour hold since/ in: “<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ec;font-family:Helvetica,Arial,sans-serif;color:#1f1d1a"> <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align=" |
| ❌ | D2 | flags Greenpoint Summer Pass: open spot, nobody left to invite | no match for /Greenpoint · Summer Pass: 1 open spot\(s\) but nobody left on the waitlist/ in: “<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ec;font-family:Helvetica,Arial,sans-serif;color:#1f1d1a"> <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><t |
| ❓ | D2 | lists "Not ready yet" people due a check-in (Noor) | no match for /Noor/ in: “<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ec;font-family:Helvetica,Arial,sans-serif;color:#1f1d1a"> <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"> <table role” |
| ❌ | I1 | the only error alert all week was the deliberately broken form | expected 1, got 2 |
| ⚠️ | I1 | no Airtable rate-limit hits all week | 3 request(s) got HTTP 429 |

## Timeline

- Day 0 · engine run (Day 0 9am): 13 invited, 9 heads-ups, 0 timed out · HTTP 200
- Day 0 · burst of 3 replies → pages: 200 “Taking you to signup”, 503 “Please try again in a minute”, 503 “Please try again in a minute”
- ⏩ 25h pass → Day 1 +1h
- Day 1 +1h · engine run (Day 1 10am): 3 invited, 2 heads-ups, 7 timed out · HTTP 200
- Day 1 +1h · engine run (Day 1 11am): 2 invited, 0 heads-ups, 0 timed out · HTTP 200
- ⏩ 72h pass → Day 4 +1h
- Day 4 +1h · engine run (Day 4): 6 invited, 0 heads-ups, 5 timed out · HTTP 200
- ⏩ 192h pass → Day 12 +1h

## Scenarios

### T1 · New member signs up via Typeform  _(Day 0)_

> Maya fills in the form for Unlimited at Williamsburg, giving her zip and that she heard about us on Instagram.

- ✅ Typeform gets a 200 so it does not retry
- ✅ one Waiting row appears for Unlimited · Williamsburg
- ✅ email is stored lower-case
- ✅ zip code and referral source are captured
- ✅ name and phone are captured
- ✅ a "Joined" entry is logged

### T2 · "All-Access (both locations)" choice  _(Day 0)_

> Leo, an existing member, picks the All-Access option and Unlimited.

- ✅ Leo is on both Williamsburg and Greenpoint Unlimited
- ✅ both rows are marked as an Existing member

### T3 · "LES" shorthand for a location that is not open yet  _(Day 0)_

> Priya picks "LES" — the Lower East Side queue is switched off until opening.

- ✅ Priya is on the Lower East Side Unlimited list

### T4 · Messy email + descriptive choice labels  _(Day 0)_

> Sam types their email with capitals and spaces; the form labels read "Daytime (weekdays before 4pm)" and "4-Visit Pack".

- ✅ email is trimmed and lower-cased
- ✅ both memberships are recognised
- ✅ apostrophe in the surname survives

### T5 · Same person submits twice  _(Day 0)_

> Maya submits the identical form again a few minutes later.

- ✅ Typeform still gets a 200
- ✅ no duplicate row, no extra "Joined" log

### T6 · Same person adds a second membership  _(Day 0)_

> Maya comes back and ticks Unlimited and Daytime.

- ✅ only the new Daytime row is added
- ✅ her Unlimited place in line is untouched

### T7 · Broken submission  _(Day 0)_

> A form arrives with no email or choices (e.g. a question was renamed in Typeform).

- ✅ Typeform gets an error (so it shows as a failed delivery and can be resent)
- ✅ the team gets an alert email naming what is missing

### T8 · Summer Pass (no price set yet)  _(Day 0)_

> Noor joins the Greenpoint Summer Pass list.

- ✅ Noor is on Greenpoint Summer Pass

### T9 · Someone types HTML into their name  _(Day 0)_

> A form arrives with first name "<b>Zed</b>" and last name "\"Q\"".

- ✅ the row is created (name stored as typed)

### T10 · "Existing member" answered as a multiple-choice  _(Day 0)_

> Jo answers "Yes, I'm a current member" (a choice question, not yes/no).

- ✅ Jo is recorded as an Existing member

### E1 · First hourly run fills open spots  _(Day 0)_

> Williamsburg Unlimited has 2 open spots, Summer Pass 1, Williamsburg 4-Visit has a mistyped minimum of 500 (meant 50), Greenpoint 4-Visit has no signup link, LES is switched off.

- ✅ Williamsburg Unlimited: Cleo (manual rank 1) and Ava (longest weighted wait) are invited
- ✅ Summer Pass: Noor is invited
- ✅ Greenpoint 4-Visit (no signup link): nobody invited
- ✅ Lower East Side (switched off): nobody invited or nudged
- ✅ the mistyped minimum (500) only lets 10 invites out in one run
- ✅ …and the 10 are the 10 longest-waiting (Guest01–Guest10)
- ❓ a mistyped minimum is stopped, not just slowed (it would keep sending 10 invites every hour) — _The per-run cap limits the damage to 10/hour per queue but nothing pauses the queue or alerts staff; the daily report does not flag an implausible minimum._
- ✅ nobody holds two spots at once (Cleo is on 2 lists, Guest01/03 on 2 lists)
- ✅ heads-up goes to the next in line: Ben, Jo, Maya, Leo, Zed (Williamsburg Unlimited), Sam (Greenpoint 4-Visit), Guest11, Guest12
- ✅ Maya gets ONE heads-up covering both her lists
- ✅ nobody gets an invite and a heads-up in the same minute (Guest01, Guest03)
- ✅ Leo (existing member) gets no heads-up for Greenpoint Unlimited, which is set to "Prioritise New Only"

### C1 · Jack reviews the invite copy  _(Day 0)_

> Jack opens the invites Cleo (Unlimited), Guest02 (4-Visit) and Noor (Summer Pass) received and compares them with his approved copy.

- ✅ subject: "Unlimited Membership Now Available at Akari Williamsburg"
- ✅ inbox preview: "Your spot is available for a limited time"
- ✅ opens "Hi Cleo,"
- ✅ Unlimited price $220/month
- ✅ 4-Visit price $140/month
- ✅ Summer Pass (no price yet) falls back to "details, including pricing, … membership page"
- ✅ the membership page is a clickable link in the email
- ✅ deadline shown is 24 hours out
- ✅ four buttons in Jack's order: Sign up · Tour first · Not ready yet · No longer interested
- ✅ "Not ready yet" explains they stay on the list
- ✅ signed "Warmly, Akari team"
- ✅ each button carries this person's own token

### C2 · Jack reviews the heads-up copy  _(Day 0)_

> Jack compares the "nearly at the front" email with his draft (template 3), with the hold at 24h not 48h.

- ✅ subject follows Jack's template: "You're Almost Up for an Unlimited Membership at Akari Williamsburg"
- ✅ inbox preview: "A spot could open up any day now"
- ✅ body follows Jack's wording ("close to the front of the line…")
- ✅ states the real hold: 24 hours (not 48)
- ✅ tells them how to come off the list
- ✅ signed "Warmly, Akari team"
- ✅ Maya's combined heads-up names both memberships
- ✅ a name typed as HTML is shown as text, not rendered
- ❓ the heads-up offers a one-click way off the list (Jack's {{remove_link}}) — _no match for /a=remove|a=leave/ in: “<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ec;font-family:Helvetica,Arial,sans-serif;color:#1f1d1a"> <div style="display:none;font-size:1px;color:#f4f1ec;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all"”_

### R1 · Cleo signs up (Unlimited) — after her mail scanner pre-clicks every link  _(Day 0)_

> Cleo's work email security scanner opens all four links first. Then Cleo clicks "Sign up" and confirms.

- ✅ the scanner's clicks change nothing
- ✅ the link opens a confirmation page showing the hold deadline
- ✅ the confirm button can't be double-submitted (button disables on submit)
- ✅ confirming sends her straight to the Williamsburg Unlimited signup page
- ❌ status → Signed Up — _expected "Signed Up", got "Invited"_
- ❌ she is removed from her Williamsburg Daytime list automatically — _expected "Removed", got "Waiting"_
- ❌ confirmation subject: "Your Private Sign Up Link for Akari Williamsburg" — _expected "Your Private Sign Up Link for Akari Williamsburg", got undefined_
- ❌ confirmation preview: "Your Unlimited membership is ready for you" — _expected "Your Unlimited membership is ready for you", got ""_
- ❌ confirmation carries the private signup link — _no match for /https:\/\/app\.glofox\.test\/signup\/wb-unl/ in: “”_
- ❌ Unlimited wording: "we'll automatically remove you from any other Akari waitlists" — _no match for /automatically remove you from any other Akari waitlists/ in: “”_

### R2 · Ava wants a tour first  _(Day 0)_

> Ava clicks "Tour first" and writes "Weekday evenings after 6".

- ❌ Ava is told her spot is held — _no match for /held for you/ in: “<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"> <meta name="robots" content="noindex"><title>Please try again in a minute · Akari Sauna</title> <style> body{margin:0;background:#f4f”_
- ❌ status → Tour Requested, notes saved — _expected ["Tour Requested","Weekday evenings after 6"], got ["Invited",null]_
- ❌ team alert: "Tour Request: Ava Romero at Akari Williamsburg" — _expected "Tour Request: Ava Romero at Akari Williamsburg", got undefined_
- ❌ alert lists email, phone, waitlist date and preferred times — _no match for /stan\+11@optimizewise\.org[\s\S]*\+17185550111[\s\S]*On the waitlist since[\s\S]*Weekday evenings after 6/ in: “”_
- ❌ alert reads naturally: "committing to an Unlimited membership" — _no match for /committing to an Unlimited membership/ in: “”_
- ❌ alert tells staff exactly what to do after the tour (Send Now) — _no match for /Send Now/ in: “”_

### R3 · Noor is not ready yet  _(Day 0)_

> Noor clicks "Not ready yet" and writes "Back in town in November".

- ❌ Noor is told she stays on the list — _no match for /still on the waitlist/ in: “<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"> <meta name="robots" content="noindex"><title>Please try again in a minute · Akari Sauna</title> <style> body{margin:0;background:#f_
- ❌ status → Not Right Now with her reason — _expected ["Not Right Now","Back in town in November"], got ["Invited",null]_
- ❓ Jack's copy promises "we'll check back in with you down the road" — something brings Noor back to Jack's attention later — _Not Right Now is a dead end: the engine never re-offers, and the daily report only shows the reason on the day it is given._

### R4 · Guest02 is no longer interested  _(Day 0)_

> Guest02 clicks "No longer interested": "Too far from me".

- ❌ status → No Longer Interested with reason — _expected ["No Longer Interested","Too far from me"], got ["Invited",null]_
- ✅ no email is sent to them

### R5 · Guest03 signs up for 4-Visit, then leaves the Daytime list  _(Day 0)_

> Guest03 also waits for Williamsburg Daytime. After signing up they use the link in the confirmation to come off the other list.

- ❌ 4-Visit wording: stays on other waitlists, with a link to come off them — _no match for /You'll stay on any other Akari waitlists you've joined\. If you'd rather come off them, you can remove yourself here: \S+a=leave/ in: “”_
- ✅ they are still on the Daytime list until they choose
- ❌ the "remove me" link opens a confirmation page first — _no match for /Leave your other waitlists/ in: “<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"> <meta name="robots" content="noindex"><title>Please try again in a minute · Akari Sauna</title> <style> body{margin:0;backgrou_
- ❌ after confirming: removed from Daytime; 4-Visit signup untouched — _expected ["Removed","Signed Up"], got ["Waiting","Invited"]_
- ❌ the page says what they were removed from — _no match for /Daytime at Williamsburg/ in: “<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"> <meta name="robots" content="noindex"><title>Please try again in a minute · Akari Sauna</title> <style> body{margin:0;background:_

### R6 · Guest04 says "not ready", then changes their mind within the hour  _(Day 0)_

> Guest04 clicks "Not ready yet", then goes back to the same email and clicks "Sign up".

- ✅ the page does not wrongly say their hold "passed before we heard back"
- ❌ the page tells them they're first in line for the next spot — _no match for /first in line/ in: “<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"> <meta name="robots" content="noindex"><title>Taking you to signup · Akari Sauna</title><meta http-equiv="refresh" content="1;url=http”_
- ❌ status → Warm (first in line) — _expected "Warm", got "Signed Up"_

### R7 · Three people click "Sign up" in the same second  _(Day 0)_

> Guest05, Guest06 and Guest07 confirm at the same moment (invites landed together at 9am). Airtable allows 5 requests a second and locks the base for 30s if exceeded.

- ✅ nobody sees a raw n8n error — each gets the signup page or a friendly "try again in a minute"
- ✅ the "busy" page retries by itself after a random 35–55s, so people caught in one burst don't all retry in the same second
- ✅ everyone told "try again" gets through on the automatic retry
- ✅ all three are Signed Up
- ✅ each gets exactly one confirmation, with no "other waitlists" paragraph (they have none)
- ✅ anyone shown the signup page is recorded as Signed Up, even though Airtable was locked when they clicked
- ⚠️ Airtable's 5 requests/second limit was not exceeded — _1 burst(s) tripped Airtable's 30s lockout; handled gracefully (see checks above)_

### R8 · Guest08 double-clicks "Sign up"  _(Day 0)_

> Guest08 hits the confirm button twice in quick succession, then a third time a minute later.

- ✅ a fast double POST (bypassing the disabled button) still sends only one confirmation
- ✅ a later click just re-opens signup — no new email, nothing changes
- ✅ …and the page still takes them to signup

### R9 · Someone tampers with a link  _(Day 0)_

> A made-up token is posted to the confirm endpoint.

- ✅ both are refused with "link has expired" (410)
- ✅ no data changes

### S1 · Send Now with a bad key  _(Day 0)_

> Someone edits the Airtable button URL and the key is wrong.

- ✅ refused (403) and nothing sent

### S2 · Jack uses Send Now for an LES pre-opening member  _(Day 0)_

> LES is switched off, but Jack wants to invite Priya now. He clicks the button twice.

- ✅ page: "Invite sent", with the hold deadline
- ✅ Priya → Invited (source: Send Now)
- ✅ second click within 2 minutes is ignored ("Already sent")
- ✅ Priya received exactly one invite
- ✅ invite subject names the location: "…at Akari Lower East Side"

### S3 · Priya signs up but LES has no signup link yet  _(Day 0)_

> Priya clicks "Sign up"; the LES Capacity row has no Signup URL.

- ✅ Priya is told her spot is confirmed and the link will follow
- ✅ status → Signed Up
- ✅ the log flags "SIGNUP URL MISSING" for staff

### D1 · Jack reads the daily report  _(Day 0)_

> The team report arrives. Jack checks it covers today and points him at what needs action.

- ✅ one report email to the team
- ✅ needs attention: Greenpoint 4-Visit has no signup link
- ✅ needs attention: Priya signed up but needs her link sent manually
- ✅ signed-up count covers Cleo, Guest03, 05, 06, 07, 08 and Priya (7)
- ❌ reasons given today are listed (Guest02 and Noor) — _one or both reasons missing_
- ✅ report is scheduled for 7:30am, before doors open (Jack's spec)
- ❓ report layout matches Jack's template 4 (Needs attention / Last 24 hours / By location) — _no match for /Invites expiring in the next 24 hours/ in: “<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ec;font-family:Helvetica,Arial,sans-serif;color:#1f1d1a"> <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px _

### E2 · Next morning: unanswered holds time out, the line moves on  _(Day 1 +1h)_

> Guest01, Guest09, Guest10 never replied. Guest04 changed their mind yesterday and was told they're first in line.

- ✅ Guest01, Guest09, Guest10 → Warm (1st timeout)
- ❌ Ava's tour hold does not time out — _expected "Tour Requested", got "Warm"_
- ❌ Guest04 (told "first in line") is re-invited straight away — _invited: stan+111@optimizewise.org, stan+112@optimizewise.org_
- ✅ people who simply ignored us (Guest01/09/10) wait out the 72h cool-down
- ✅ Guest11 and Guest12 get their turn
- ❌ Williamsburg Unlimited: no new invite while Cleo's signup awaits Jack's recount and Ava's tour holds the other spot — _expected 0, got 1_

### S4 · Jack recounts and adds a spot; Guest09 replies late  _(Day 1 +1h)_

> Jack updates Williamsburg Unlimited: Active 39 (Cleo joined), Minimum 41. Guest09 finds yesterday's email and clicks "Sign up".

- ✅ Guest09 is told the hold passed and they're first in line
- ✅ Guest09 stays Warm, reply time recorded
- ❌ the new Williamsburg Unlimited spot goes to Ben (existing member, 121 days waiting) — _expected ["Ben Fischer"], got ["Maya Chen"]_
- ✅ Guest09 (late reply) is re-invited; Guest10 (no reply) is not

### S5 · After Ava's tour, Jack sends her the invite again  _(Day 1 +1h)_

> Ava loved the tour. Jack presses Send Now on her row; Ava uses the new email.

- ✅ page: "Invite sent"
- ✅ the old invite's links stop working (410)
- ✅ Ava → Signed Up, sent to signup

### S6 · A new member fills in the form again  _(Day 1 +1h)_

> Cleo (signed up yesterday) fills in the Typeform again out of habit, ticking Williamsburg Unlimited.

- ✅ she is not put back on the waitlist for the membership she just bought

### E4 · Day 4: cool-downs end, repeat no-shows drop out  _(Day 4 +1h)_

> Three days later. Guest09 ignored their second invite. Ben ignored his.

- ✅ Guest09 (2nd timeout) → No Reply, out of the line
- ✅ Guest10 (cool-down over) is invited again
- ❌ Ben timed out → Warm; the Williamsburg Unlimited spot goes to Maya (Ben is cooling down) — _expected ["Warm",["Maya Chen"]], got ["Warm",["Jo Park"]]_
- ✅ Maya asks for a tour; the alert reads "an Unlimited membership"

### D2 · Day 12 report: what has been forgotten?  _(Day 12 +1h)_

> Nobody followed up on Maya's tour. Noor said "not ready" 12 days ago.

- ❌ flags Maya's tour hold as stale (over 7 days) — _no match for /Maya Chen \(Unlimited at Williamsburg\) has had a tour hold since/ in: “<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ec;font-family:Helvetica,Arial,sans-serif;color:#1f1d1a"> <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="_
- ❌ flags Greenpoint Summer Pass: open spot, nobody left to invite — _no match for /Greenpoint · Summer Pass: 1 open spot\(s\) but nobody left on the waitlist/ in: “<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ec;font-family:Helvetica,Arial,sans-serif;color:#1f1d1a"> <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><t_
- ❓ lists "Not ready yet" people due a check-in (Noor) — _no match for /Noor/ in: “<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ec;font-family:Helvetica,Arial,sans-serif;color:#1f1d1a"> <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"> <table role”_

### I1 · Data integrity across the whole run  _(Day 12 +1h)_

> What Jack would spot-check in Airtable and the inbox.

- ✅ every dropdown value written is one Airtable already has (no stray options)
- ✅ every Invited row has a 48-character token and a deadline
- ✅ nobody holds two spots at once
- ✅ every Signed Up row has a matching "Signed Up" log
- ✅ no email contains "undefined", "NaN", "null", "[object Object]" or a placeholder token
- ✅ every email has both a plain-text and an HTML version, and a subject
- ❌ the only error alert all week was the deliberately broken form — _expected 1, got 2_
- ✅ no rejected Airtable/SendGrid calls (bad formulas, >10-row batches, bad payloads)
- ⚠️ no Airtable rate-limit hits all week — _3 request(s) got HTTP 429_

## Final Airtable state (Waitlist)

| Name | Email | Queue | Status | Timeouts | Source |
|---|---|---|---|---|---|
| Cleo Ortiz | stan+10@optimizewise.org | Williamsburg · Unlimited | Signed Up | 0 | Auto |
| Cleo Ortiz | stan+10@optimizewise.org | Williamsburg · Daytime | Removed | 0 |  |
| Ava Romero | stan+11@optimizewise.org | Williamsburg · Unlimited | Signed Up | 1 | Send Now |
| Ben Fischer | stan+12@optimizewise.org | Williamsburg · Unlimited | Warm | 1 | Auto |
| Guest01 Test | stan+101@optimizewise.org | Williamsburg · 4-Visit | Invited | 1 | Auto |
| Guest02 Test | stan+102@optimizewise.org | Williamsburg · 4-Visit | Invited | 1 | Auto |
| Guest03 Test | stan+103@optimizewise.org | Williamsburg · 4-Visit | Invited | 1 | Auto |
| Guest04 Test | stan+104@optimizewise.org | Williamsburg · 4-Visit | Signed Up | 0 | Auto |
| Guest05 Test | stan+105@optimizewise.org | Williamsburg · 4-Visit | Signed Up | 0 | Auto |
| Guest06 Test | stan+106@optimizewise.org | Williamsburg · 4-Visit | Signed Up | 0 | Auto |
| Guest07 Test | stan+107@optimizewise.org | Williamsburg · 4-Visit | Signed Up | 0 | Auto |
| Guest08 Test | stan+108@optimizewise.org | Williamsburg · 4-Visit | Signed Up | 0 | Auto |
| Guest09 Test | stan+109@optimizewise.org | Williamsburg · 4-Visit | No Reply | 2 | Auto |
| Guest10 Test | stan+110@optimizewise.org | Williamsburg · 4-Visit | Invited | 1 | Auto |
| Guest11 Test | stan+111@optimizewise.org | Williamsburg · 4-Visit | Warm | 1 | Auto |
| Guest12 Test | stan+112@optimizewise.org | Williamsburg · 4-Visit | Warm | 1 | Auto |
| Guest01 Test | stan+101@optimizewise.org | Greenpoint · Unlimited | Primed | 0 |  |
| Guest03 Test | stan+103@optimizewise.org | Williamsburg · Daytime | Primed | 0 |  |
| Maya Chen | stan+1@optimizewise.org | Williamsburg · Unlimited | Warm | 1 | Auto |
| Leo Brooks | stan+2@optimizewise.org | Williamsburg · Unlimited | Primed | 0 |  |
| Leo Brooks | stan+2@optimizewise.org | Greenpoint · Unlimited | Waiting | 0 |  |
| Priya Shah | stan+3@optimizewise.org | Lower East Side · Unlimited | Signed Up | 0 | Send Now |
| Sam O'Connor | stan+4@optimizewise.org | Greenpoint · Daytime | Waiting | 0 |  |
| Sam O'Connor | stan+4@optimizewise.org | Greenpoint · 4-Visit | Primed | 0 |  |
| Maya Chen | stan+1@optimizewise.org | Williamsburg · Daytime | Primed | 0 |  |
| Noor Haddad | stan+5@optimizewise.org | Greenpoint · Summer Pass | Invited | 1 | Auto |
| bZed/b "Q" | stan+6@optimizewise.org | Williamsburg · Unlimited | Primed | 0 |  |
| Jo Park | stan+7@optimizewise.org | Williamsburg · Unlimited | Invited | 0 | Auto |

## Inbox (every email sent, in order)

<details><summary>1. <b>[Waitlist automation] Intake: submission broken-1 is missing email, location, membership — check the T</b> → team@YOUR-DOMAIN.com</summary>

```text
Preview: (none)

Workflow: Akari Waitlist Automation v1
Failed node: Parse Typeform
Error: Intake: submission broken-1 is missing email, location, membership — check the Typeform choice labels [line 84]
Mode: webhook
Execution: http://localhost:5678/workflow/akariWaitlistUAT1/executions/8

Open the execution in n8n to see the input data, fix the cause, and retry it if needed.
```
</details>

<details><summary>2. <b>Unlimited Membership Now Available at Akari Williamsburg</b> → stan+10@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Cleo,

We really appreciate your patience during the waitlist process for the Unlimited membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $220/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 3:59 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=165243bdaa987dd8f0ab28d83b269ce97bbe24e396ae10ff&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=165243bdaa987dd8f0ab28d83b269ce97bbe24e396ae10ff&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=165243bdaa987dd8f0ab28d83b269ce97bbe24e396ae10ff&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=165243bdaa987dd8f0ab28d83b269ce97bbe24e396ae10ff&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>3. <b>Unlimited Membership Now Available at Akari Williamsburg</b> → stan+11@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Ava,

We really appreciate your patience during the waitlist process for the Unlimited membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $220/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 3:59 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=c5318a6da71a42e47f6ddfe2d84845244e9c868146b48172&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=c5318a6da71a42e47f6ddfe2d84845244e9c868146b48172&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=c5318a6da71a42e47f6ddfe2d84845244e9c868146b48172&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=c5318a6da71a42e47f6ddfe2d84845244e9c868146b48172&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>4. <b>Summer Pass Membership Now Available at Akari Greenpoint</b> → stan+5@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Noor,

We really appreciate your patience during the waitlist process for the Summer Pass membership at Akari Greenpoint. We are in the process of opening more memberships this month, and we would love to have you join us!

Additional membership details, including pricing, can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 3:59 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=04b2bf79369cae6bbaee9a977c0a56d07615447723ea8c84&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=04b2bf79369cae6bbaee9a977c0a56d07615447723ea8c84&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=04b2bf79369cae6bbaee9a977c0a56d07615447723ea8c84&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=04b2bf79369cae6bbaee9a977c0a56d07615447723ea8c84&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>5. <b>4-Visit Membership Now Available at Akari Williamsburg</b> → stan+101@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Guest01,

We really appreciate your patience during the waitlist process for the 4-Visit membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 3:59 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=5fe83dacc4e35819deb7bb09e442b845e3931258eda6ba4c&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=5fe83dacc4e35819deb7bb09e442b845e3931258eda6ba4c&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=5fe83dacc4e35819deb7bb09e442b845e3931258eda6ba4c&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=5fe83dacc4e35819deb7bb09e442b845e3931258eda6ba4c&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>6. <b>4-Visit Membership Now Available at Akari Williamsburg</b> → stan+102@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Guest02,

We really appreciate your patience during the waitlist process for the 4-Visit membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 3:59 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=aa18b05f5ef8af4da9ca8262032c78956d0576df76d41247&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=aa18b05f5ef8af4da9ca8262032c78956d0576df76d41247&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=aa18b05f5ef8af4da9ca8262032c78956d0576df76d41247&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=aa18b05f5ef8af4da9ca8262032c78956d0576df76d41247&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>7. <b>4-Visit Membership Now Available at Akari Williamsburg</b> → stan+103@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Guest03,

We really appreciate your patience during the waitlist process for the 4-Visit membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 3:59 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=de5ecc9555e2b8d9fd803a2aee9631ac884e80caef3ae443&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=de5ecc9555e2b8d9fd803a2aee9631ac884e80caef3ae443&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=de5ecc9555e2b8d9fd803a2aee9631ac884e80caef3ae443&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=de5ecc9555e2b8d9fd803a2aee9631ac884e80caef3ae443&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>8. <b>4-Visit Membership Now Available at Akari Williamsburg</b> → stan+104@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Guest04,

We really appreciate your patience during the waitlist process for the 4-Visit membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 3:59 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=c1a71d1a5d7317e365114f06618da102a0d7d5c4c8f3c29d&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=c1a71d1a5d7317e365114f06618da102a0d7d5c4c8f3c29d&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=c1a71d1a5d7317e365114f06618da102a0d7d5c4c8f3c29d&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=c1a71d1a5d7317e365114f06618da102a0d7d5c4c8f3c29d&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>9. <b>4-Visit Membership Now Available at Akari Williamsburg</b> → stan+105@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Guest05,

We really appreciate your patience during the waitlist process for the 4-Visit membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 3:59 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=a8549f98e096fbe69d54d70413b0ab2b625cb9618993745d&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=a8549f98e096fbe69d54d70413b0ab2b625cb9618993745d&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=a8549f98e096fbe69d54d70413b0ab2b625cb9618993745d&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=a8549f98e096fbe69d54d70413b0ab2b625cb9618993745d&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>10. <b>4-Visit Membership Now Available at Akari Williamsburg</b> → stan+106@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Guest06,

We really appreciate your patience during the waitlist process for the 4-Visit membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 3:59 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=a45364e418ed612f9a9dc41d1104096c4360cf88ea28cd23&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=a45364e418ed612f9a9dc41d1104096c4360cf88ea28cd23&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=a45364e418ed612f9a9dc41d1104096c4360cf88ea28cd23&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=a45364e418ed612f9a9dc41d1104096c4360cf88ea28cd23&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>11. <b>4-Visit Membership Now Available at Akari Williamsburg</b> → stan+107@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Guest07,

We really appreciate your patience during the waitlist process for the 4-Visit membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 3:59 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=c52394ae215482c1ff148074a2da9a70a8e7445495fb510b&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=c52394ae215482c1ff148074a2da9a70a8e7445495fb510b&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=c52394ae215482c1ff148074a2da9a70a8e7445495fb510b&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=c52394ae215482c1ff148074a2da9a70a8e7445495fb510b&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>12. <b>4-Visit Membership Now Available at Akari Williamsburg</b> → stan+108@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Guest08,

We really appreciate your patience during the waitlist process for the 4-Visit membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 3:59 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=7b474df4c8609ad4e3df2306b8395069b56d24b1dea41445&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=7b474df4c8609ad4e3df2306b8395069b56d24b1dea41445&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=7b474df4c8609ad4e3df2306b8395069b56d24b1dea41445&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=7b474df4c8609ad4e3df2306b8395069b56d24b1dea41445&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>13. <b>4-Visit Membership Now Available at Akari Williamsburg</b> → stan+109@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Guest09,

We really appreciate your patience during the waitlist process for the 4-Visit membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 3:59 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=49a451ccae21a0aace03c40ef51215205cdd1de49fd957dc&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=49a451ccae21a0aace03c40ef51215205cdd1de49fd957dc&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=49a451ccae21a0aace03c40ef51215205cdd1de49fd957dc&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=49a451ccae21a0aace03c40ef51215205cdd1de49fd957dc&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>14. <b>4-Visit Membership Now Available at Akari Williamsburg</b> → stan+110@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Guest10,

We really appreciate your patience during the waitlist process for the 4-Visit membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 3:59 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=25de65ee3cf337f9225ea76723e3d0853a0c613f6d25e47e&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=25de65ee3cf337f9225ea76723e3d0853a0c613f6d25e47e&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=25de65ee3cf337f9225ea76723e3d0853a0c613f6d25e47e&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=25de65ee3cf337f9225ea76723e3d0853a0c613f6d25e47e&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>15. <b>You're Almost Up for an Unlimited Membership at Akari Williamsburg</b> → stan+12@optimizewise.org</summary>

```text
Preview: A spot could open up any day now

Hi Ben,

Thank you for your continued patience on the waitlist for the Unlimited membership at Akari Williamsburg. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.

When it does, we'll send you an email with all the details, and you'll have 24 hours to claim your spot.

If you're still interested, there's nothing you need to do. If your plans have changed, just reply to this email and we'll remove you from the waitlist.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>16. <b>You're Almost Up for a Membership at Akari Williamsburg</b> → stan+1@optimizewise.org</summary>

```text
Preview: A spot could open up any day now

Hi Maya,

Thank you for your continued patience on the waitlist for the Unlimited membership at Akari Williamsburg and the Daytime membership at Akari Williamsburg. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.

When it does, we'll send you an email with all the details, and you'll have 24 hours to claim your spot.

If you're still interested, there's nothing you need to do. If your plans have changed, just reply to this email and we'll remove you from the waitlist.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>17. <b>You're Almost Up for an Unlimited Membership at Akari Williamsburg</b> → stan+7@optimizewise.org</summary>

```text
Preview: A spot could open up any day now

Hi Jo,

Thank you for your continued patience on the waitlist for the Unlimited membership at Akari Williamsburg. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.

When it does, we'll send you an email with all the details, and you'll have 24 hours to claim your spot.

If you're still interested, there's nothing you need to do. If your plans have changed, just reply to this email and we'll remove you from the waitlist.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>18. <b>You're Almost Up for an Unlimited Membership at Akari Williamsburg</b> → stan+2@optimizewise.org</summary>

```text
Preview: A spot could open up any day now

Hi Leo,

Thank you for your continued patience on the waitlist for the Unlimited membership at Akari Williamsburg. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.

When it does, we'll send you an email with all the details, and you'll have 24 hours to claim your spot.

If you're still interested, there's nothing you need to do. If your plans have changed, just reply to this email and we'll remove you from the waitlist.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>19. <b>You're Almost Up for an Unlimited Membership at Akari Williamsburg</b> → stan+6@optimizewise.org</summary>

```text
Preview: A spot could open up any day now

Hi <b>Zed</b>,

Thank you for your continued patience on the waitlist for the Unlimited membership at Akari Williamsburg. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.

When it does, we'll send you an email with all the details, and you'll have 24 hours to claim your spot.

If you're still interested, there's nothing you need to do. If your plans have changed, just reply to this email and we'll remove you from the waitlist.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>20. <b>You're Almost Up for a 4-Visit Membership at Akari Greenpoint</b> → stan+4@optimizewise.org</summary>

```text
Preview: A spot could open up any day now

Hi Sam,

Thank you for your continued patience on the waitlist for the 4-Visit membership at Akari Greenpoint. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.

When it does, we'll send you an email with all the details, and you'll have 24 hours to claim your spot.

If you're still interested, there's nothing you need to do. If your plans have changed, just reply to this email and we'll remove you from the waitlist.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>21. <b>You're Almost Up for a 4-Visit Membership at Akari Williamsburg</b> → stan+111@optimizewise.org</summary>

```text
Preview: A spot could open up any day now

Hi Guest11,

Thank you for your continued patience on the waitlist for the 4-Visit membership at Akari Williamsburg. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.

When it does, we'll send you an email with all the details, and you'll have 24 hours to claim your spot.

If you're still interested, there's nothing you need to do. If your plans have changed, just reply to this email and we'll remove you from the waitlist.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>22. <b>You're Almost Up for a 4-Visit Membership at Akari Williamsburg</b> → stan+112@optimizewise.org</summary>

```text
Preview: A spot could open up any day now

Hi Guest12,

Thank you for your continued patience on the waitlist for the 4-Visit membership at Akari Williamsburg. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.

When it does, we'll send you an email with all the details, and you'll have 24 hours to claim your spot.

If you're still interested, there's nothing you need to do. If your plans have changed, just reply to this email and we'll remove you from the waitlist.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>23. <b>[Waitlist automation] The service is receiving too many requests from you</b> → team@YOUR-DOMAIN.com</summary>

```text
Preview: (none)

Workflow: Akari Waitlist Automation v1
Failed node: Get Active Entries
Error: The service is receiving too many requests from you
Mode: trigger
Execution: http://localhost:5678/workflow/akariWaitlistUAT1/executions/20

This was Airtable's temporary rate limit (several things happened at once). Nothing was half-saved: the hourly engine simply runs again next hour, and candidates were asked to try again. No action needed unless you see this repeatedly.
```
</details>

<details><summary>24. <b>Your Private Sign Up Link for Akari Williamsburg</b> → stan+104@optimizewise.org</summary>

```text
Preview: Your 4-Visit membership is ready for you

Hi Guest04,

Thank you for your interest in joining Akari! Here is your private sign up link for your 4-Visit membership at Akari Williamsburg: https://app.glofox.test/signup/wb-4v



Please let us know if you have any issues signing up!

Warmly,
Akari team
```
</details>

<details><summary>25. <b>Your Private Sign Up Link for Akari Williamsburg</b> → stan+10@optimizewise.org</summary>

```text
Preview: Your Unlimited membership is ready for you

Hi Cleo,

Thank you for your interest in joining Akari! Here is your private sign up link for your Unlimited membership at Akari Williamsburg: https://app.glofox.test/signup/wb-unl

Once you sign up for your Unlimited membership, we'll automatically remove you from any other Akari waitlists you've joined.

Please let us know if you have any issues signing up!

Warmly,
Akari team
```
</details>

<details><summary>26. <b>Your Private Sign Up Link for Akari Williamsburg</b> → stan+105@optimizewise.org</summary>

```text
Preview: Your 4-Visit membership is ready for you

Hi Guest05,

Thank you for your interest in joining Akari! Here is your private sign up link for your 4-Visit membership at Akari Williamsburg: https://app.glofox.test/signup/wb-4v



Please let us know if you have any issues signing up!

Warmly,
Akari team
```
</details>

<details><summary>27. <b>Your Private Sign Up Link for Akari Williamsburg</b> → stan+106@optimizewise.org</summary>

```text
Preview: Your 4-Visit membership is ready for you

Hi Guest06,

Thank you for your interest in joining Akari! Here is your private sign up link for your 4-Visit membership at Akari Williamsburg: https://app.glofox.test/signup/wb-4v



Please let us know if you have any issues signing up!

Warmly,
Akari team
```
</details>

<details><summary>28. <b>Your Private Sign Up Link for Akari Williamsburg</b> → stan+107@optimizewise.org</summary>

```text
Preview: Your 4-Visit membership is ready for you

Hi Guest07,

Thank you for your interest in joining Akari! Here is your private sign up link for your 4-Visit membership at Akari Williamsburg: https://app.glofox.test/signup/wb-4v



Please let us know if you have any issues signing up!

Warmly,
Akari team
```
</details>

<details><summary>29. <b>Your Private Sign Up Link for Akari Williamsburg</b> → stan+108@optimizewise.org</summary>

```text
Preview: Your 4-Visit membership is ready for you

Hi Guest08,

Thank you for your interest in joining Akari! Here is your private sign up link for your 4-Visit membership at Akari Williamsburg: https://app.glofox.test/signup/wb-4v



Please let us know if you have any issues signing up!

Warmly,
Akari team
```
</details>

<details><summary>30. <b>Unlimited Membership Now Available at Akari Lower East Side</b> → stan+3@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Priya,

We really appreciate your patience during the waitlist process for the Unlimited membership at Akari Lower East Side. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $220/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 4:04 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=f68e08dd4faec4f96f0f92f599b6c2021ab1430e084b60a4&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=f68e08dd4faec4f96f0f92f599b6c2021ab1430e084b60a4&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=f68e08dd4faec4f96f0f92f599b6c2021ab1430e084b60a4&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=f68e08dd4faec4f96f0f92f599b6c2021ab1430e084b60a4&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>31. <b>Your Private Sign Up Link for Akari Lower East Side</b> → stan+3@optimizewise.org</summary>

```text
Preview: Your Unlimited membership is ready for you

Hi Priya,

Thank you for your interest in joining Akari! Here is your private sign up link for your Unlimited membership at Akari Lower East Side: (signup link pending — we'll send it shortly)



Please let us know if you have any issues signing up!

Warmly,
Akari team
```
</details>

<details><summary>32. <b>Waitlist summary — Thursday, October 15</b> → team@YOUR-DOMAIN.com</summary>

```text
Preview: (none)

Waitlist daily summary — Thursday, October 15
! Greenpoint · 4-Visit: no Signup URL, so no invites are being sent.
! stan+3@optimizewise.org signed up for Unlimited at Lower East Side but no signup link was configured — send it manually.
Invited (auto): 13
Invited (Send Now): 1
Signed up: 7
Tour requested: 0
Not right now: 0
No longer interested: 0
Timed out: 0
Late replies: 0
Heads-ups sent: 9
Joined waitlist: 10
```
</details>

<details><summary>33. <b>Unlimited Membership Now Available at Akari Williamsburg</b> → stan+12@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Ben,

We really appreciate your patience during the waitlist process for the Unlimited membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $220/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 4:04 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=59569fb82ad586831e9fc768acc4b6fbc12ad3c1c30b8f9e&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=59569fb82ad586831e9fc768acc4b6fbc12ad3c1c30b8f9e&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=59569fb82ad586831e9fc768acc4b6fbc12ad3c1c30b8f9e&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=59569fb82ad586831e9fc768acc4b6fbc12ad3c1c30b8f9e&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>34. <b>4-Visit Membership Now Available at Akari Williamsburg</b> → stan+111@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Guest11,

We really appreciate your patience during the waitlist process for the 4-Visit membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 4:04 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=c875228ffeea12cb20a3e13f99e2cebbed3b49d6b1762f7c&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=c875228ffeea12cb20a3e13f99e2cebbed3b49d6b1762f7c&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=c875228ffeea12cb20a3e13f99e2cebbed3b49d6b1762f7c&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=c875228ffeea12cb20a3e13f99e2cebbed3b49d6b1762f7c&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>35. <b>4-Visit Membership Now Available at Akari Williamsburg</b> → stan+112@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Guest12,

We really appreciate your patience during the waitlist process for the 4-Visit membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 4:04 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=1948b08bba69854b35bedbd8437950f73729253a01b4bab5&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=1948b08bba69854b35bedbd8437950f73729253a01b4bab5&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=1948b08bba69854b35bedbd8437950f73729253a01b4bab5&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=1948b08bba69854b35bedbd8437950f73729253a01b4bab5&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>36. <b>You're Almost Up for a Daytime Membership at Akari Williamsburg</b> → stan+103@optimizewise.org</summary>

```text
Preview: A spot could open up any day now

Hi Guest03,

Thank you for your continued patience on the waitlist for the Daytime membership at Akari Williamsburg. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.

When it does, we'll send you an email with all the details, and you'll have 24 hours to claim your spot.

If you're still interested, there's nothing you need to do. If your plans have changed, just reply to this email and we'll remove you from the waitlist.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>37. <b>You're Almost Up for an Unlimited Membership at Akari Greenpoint</b> → stan+101@optimizewise.org</summary>

```text
Preview: A spot could open up any day now

Hi Guest01,

Thank you for your continued patience on the waitlist for the Unlimited membership at Akari Greenpoint. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.

When it does, we'll send you an email with all the details, and you'll have 24 hours to claim your spot.

If you're still interested, there's nothing you need to do. If your plans have changed, just reply to this email and we'll remove you from the waitlist.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>38. <b>Unlimited Membership Now Available at Akari Williamsburg</b> → stan+1@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Maya,

We really appreciate your patience during the waitlist process for the Unlimited membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $220/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 4:04 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=2dd02c81a42c71181b56da0f7f35776d1dc93dbd75cb2b32&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=2dd02c81a42c71181b56da0f7f35776d1dc93dbd75cb2b32&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=2dd02c81a42c71181b56da0f7f35776d1dc93dbd75cb2b32&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=2dd02c81a42c71181b56da0f7f35776d1dc93dbd75cb2b32&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>39. <b>4-Visit Membership Now Available at Akari Williamsburg</b> → stan+109@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Guest09,

We really appreciate your patience during the waitlist process for the 4-Visit membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 4:04 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=4de4ad97795f61e943075a7e7db7649bb7179fabb7e023c3&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=4de4ad97795f61e943075a7e7db7649bb7179fabb7e023c3&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=4de4ad97795f61e943075a7e7db7649bb7179fabb7e023c3&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=4de4ad97795f61e943075a7e7db7649bb7179fabb7e023c3&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>40. <b>Unlimited Membership Now Available at Akari Williamsburg</b> → stan+11@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Ava,

We really appreciate your patience during the waitlist process for the Unlimited membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $220/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 4:04 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=df10c6851034dd1d676fccb6b325e40a753c1dfb77b6d1e6&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=df10c6851034dd1d676fccb6b325e40a753c1dfb77b6d1e6&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=df10c6851034dd1d676fccb6b325e40a753c1dfb77b6d1e6&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=df10c6851034dd1d676fccb6b325e40a753c1dfb77b6d1e6&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>41. <b>Your Private Sign Up Link for Akari Williamsburg</b> → stan+11@optimizewise.org</summary>

```text
Preview: Your Unlimited membership is ready for you

Hi Ava,

Thank you for your interest in joining Akari! Here is your private sign up link for your Unlimited membership at Akari Williamsburg: https://app.glofox.test/signup/wb-unl



Please let us know if you have any issues signing up!

Warmly,
Akari team
```
</details>

<details><summary>42. <b>Unlimited Membership Now Available at Akari Williamsburg</b> → stan+7@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Jo,

We really appreciate your patience during the waitlist process for the Unlimited membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $220/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 4:05 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=995cb66d9dbc5e814181846fc45c54d44e466376763ca3eb&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=995cb66d9dbc5e814181846fc45c54d44e466376763ca3eb&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=995cb66d9dbc5e814181846fc45c54d44e466376763ca3eb&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=995cb66d9dbc5e814181846fc45c54d44e466376763ca3eb&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>43. <b>Summer Pass Membership Now Available at Akari Greenpoint</b> → stan+5@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Noor,

We really appreciate your patience during the waitlist process for the Summer Pass membership at Akari Greenpoint. We are in the process of opening more memberships this month, and we would love to have you join us!

Additional membership details, including pricing, can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 4:05 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=0e7dd1111bec83f42c20d380ef5f25db08f8fe47ac734bcb&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=0e7dd1111bec83f42c20d380ef5f25db08f8fe47ac734bcb&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=0e7dd1111bec83f42c20d380ef5f25db08f8fe47ac734bcb&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=0e7dd1111bec83f42c20d380ef5f25db08f8fe47ac734bcb&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>44. <b>4-Visit Membership Now Available at Akari Williamsburg</b> → stan+101@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Guest01,

We really appreciate your patience during the waitlist process for the 4-Visit membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 4:05 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=7cf108800b3911842524472d206f5de065b3acd8e65f40e3&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=7cf108800b3911842524472d206f5de065b3acd8e65f40e3&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=7cf108800b3911842524472d206f5de065b3acd8e65f40e3&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=7cf108800b3911842524472d206f5de065b3acd8e65f40e3&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>45. <b>4-Visit Membership Now Available at Akari Williamsburg</b> → stan+102@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Guest02,

We really appreciate your patience during the waitlist process for the 4-Visit membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 4:05 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=e8b3902c5cbadbceecb406407c359cf8ec87795bb4119fb4&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=e8b3902c5cbadbceecb406407c359cf8ec87795bb4119fb4&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=e8b3902c5cbadbceecb406407c359cf8ec87795bb4119fb4&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=e8b3902c5cbadbceecb406407c359cf8ec87795bb4119fb4&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>46. <b>4-Visit Membership Now Available at Akari Williamsburg</b> → stan+103@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Guest03,

We really appreciate your patience during the waitlist process for the 4-Visit membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 4:05 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=2bc0969d4bf6c545b0d821a73b3ccc2a2804a5cfefc422d2&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=2bc0969d4bf6c545b0d821a73b3ccc2a2804a5cfefc422d2&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=2bc0969d4bf6c545b0d821a73b3ccc2a2804a5cfefc422d2&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=2bc0969d4bf6c545b0d821a73b3ccc2a2804a5cfefc422d2&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>47. <b>4-Visit Membership Now Available at Akari Williamsburg</b> → stan+110@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Guest10,

We really appreciate your patience during the waitlist process for the 4-Visit membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Fri, Oct 16, 4:05 PM EDT. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=23360579ffb5531e620efbdeee3f72f71f70ea332acc7bfe&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=23360579ffb5531e620efbdeee3f72f71f70ea332acc7bfe&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=23360579ffb5531e620efbdeee3f72f71f70ea332acc7bfe&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=23360579ffb5531e620efbdeee3f72f71f70ea332acc7bfe&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>48. <b>Tour Request: Maya Chen at Akari Williamsburg (late reply)</b> → team@YOUR-DOMAIN.com</summary>

```text
Preview: Please reach out within 1 business day to schedule

Hi team,

Maya Chen would like to tour Akari Williamsburg before committing to an Unlimited membership. Their details are below:
Email: stan+1@optimizewise.org | Phone: +17185550100 | On the waitlist since: Thu, Oct 1, 2:59 PM EDT | Spot held until: Not held — they replied after their original hold expired | Preferred times: Saturday morning

Please reach out within 1 business day to schedule a time. When possible, we recommend booking during a quieter hour so they can get a real feel for the space.

Because they replied after their original hold expired, the spot was NOT held for them — they're now first in line (Warm) for the next opening.

If they decide to join, press Send Now on their row in Airtable — that sends them a fresh invite with their private sign up link.

Thank you,
Akari team
```
</details>

<details><summary>49. <b>Waitlist summary — Thursday, October 15</b> → team@YOUR-DOMAIN.com</summary>

```text
Preview: (none)

Waitlist daily summary — Thursday, October 15
! Greenpoint · 4-Visit: no Signup URL, so no invites are being sent.
Invited (auto): 0
Invited (Send Now): 0
Signed up: 0
Tour requested: 0
Not right now: 0
No longer interested: 0
Timed out: 0
Late replies: 0
Heads-ups sent: 0
Joined waitlist: 0
```
</details>

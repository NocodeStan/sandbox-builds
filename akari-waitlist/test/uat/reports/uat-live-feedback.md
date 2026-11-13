# Akari Waitlist · UAT run `live-feedback`

Run 2026-11-13T03:57:42.179Z · n8n 2.40.6 · real workflow JSON, mock Airtable + SendGrid · 298 API calls · 50 emails

**170 pass · 0 fail · 2 risk · 0 open decision** across 38 scenarios

Legend: ✅ pass · ❌ fail (defect) · ⚠️ risk (works, residual risk) · ❓ open (needs a product decision)

## Findings

| | Scenario | Check | Detail |
|---|---|---|---|
| ⚠️ | R7 | Airtable's 5 requests/second limit was not exceeded | 1 burst(s) tripped Airtable's 30s lockout; handled gracefully (see checks above) |
| ⚠️ | I1 | no Airtable rate-limit hits all week | 3 request(s) got HTTP 429 |

## Timeline

- Day 0 · engine run (Day 0 9am): 13 invited, 9 heads-ups, 0 timed out · HTTP 200
- Day 0 · burst of 3 replies → pages: 503 “Please try again in a minute”, 200 “Taking you to signup”, 503 “Please try again in a minute”
- ⏩ 49h pass → Day 2 +1h
- Day 2 +1h · engine run (Day 1 10am): 3 invited, 1 heads-ups, 3 timed out · HTTP 200
- Day 2 +1h · engine run (Day 1 11am): 2 invited, 0 heads-ups, 0 timed out · HTTP 200
- ⏩ 72h pass → Day 5 +1h
- Day 5 +1h · engine run (Day 4): 1 invited, 0 heads-ups, 5 timed out · HTTP 200
- Day 5 +1h · engine run (Day 4, next hour): 1 invited, 0 heads-ups, 0 timed out · HTTP 200
- ⏩ 192h pass → Day 13 +1h
- Day 13 +1h · collision: engine + 2 replies → 1 lockout(s); pages 503, 503
- Day 13 +1h · engine run (Day 12, next hour): 0 invited, 0 heads-ups, 0 timed out · HTTP 200
- Day 13 +1h · follow-up run sent 0 email(s)
- ⏩ 1200h pass → Day 63 +1h

## Scenarios

### T1 · New member signs up via Typeform  _(Day 0)_

> Maya fills in the form for Unlimited at Williamsburg, giving her zip and that she heard about us on Instagram.

- ✅ Typeform gets a 200 so it does not retry
- ✅ one Waiting row appears for Unlimited · Williamsburg
- ✅ email is stored lower-case
- ✅ zip code and referral source are captured
- ✅ name and phone are captured
- ✅ a "Joined" entry is logged

### T2 · Two locations at once  _(Day 0)_

> Leo, an existing member, ticks Williamsburg and Greenpoint and answers Unlimited.

- ✅ Leo is on both Williamsburg and Greenpoint Unlimited
- ✅ both rows are marked as an Existing member

### T3 · A location that is not open yet  _(Day 0)_

> Priya picks "LES" — the LES queue is switched off until opening.

- ✅ Priya is on the LES Unlimited list (named as on the form)

### T4 · Messy email + descriptive choice labels  _(Day 0)_

> Sam types their email with capitals and spaces; the form labels read "Daytime (weekdays before 4pm)" and "4-Visit - $140/month".

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

### T11 · The consolidated form: All-Access and a location the team just added  _(Day 0)_

> Rae uses the new single form: All-Access Unlimited ($260) and Akari Yu "Limited 3-Visit/Month - $XXX/month". Neither queue exists in Airtable yet.

- ✅ Typeform gets a 200
- ✅ Rae is on "All-Access · Unlimited" and "Akari Yu · Limited 3-Visit/Month" (one list each, not spread across locations)
- ✅ both queues get a Capacity row, switched off with Minimum and Active at 0
- ✅ the All-Access row takes $260 from the form label; "$XXX" leaves Akari Yu's price blank

### E1 · First hourly run fills open spots  _(Day 0)_

> Williamsburg Unlimited has 2 open spots, Summer Pass 1, Williamsburg 4-Visit has 10, Greenpoint Daytime has a mistyped minimum of 500 (meant 50), Greenpoint 4-Visit has no signup link, LES is switched off.

- ✅ Williamsburg Unlimited: Cleo (manual rank 1) and Ava (longest weighted wait) are invited
- ✅ Summer Pass: Noor is invited
- ✅ Greenpoint 4-Visit (no signup link): nobody invited
- ✅ LES (switched off): nobody invited or nudged
- ✅ All-Access and Akari Yu (new, not set up yet): nobody invited or nudged
- ✅ Williamsburg 4-Visit: 10 open spots → the 10 longest-waiting (Guest01–Guest10) are invited
- ✅ Greenpoint Daytime (mistyped minimum, 490 open spots): paused — nobody invited or sent a heads-up
- ✅ the team gets one "Check Minimum Members" alert naming the queue and the numbers
- ✅ the pause is logged ("Queue Paused") for the Activity Log
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
- ✅ the membership page is a clickable link on the word "here" (Jack, T2)
- ✅ deadline shown is 48 hours out
- ✅ four buttons in Jack's order: Sign up · Tour first · Not ready yet · No longer interested
- ✅ "Not ready yet" explains they stay on the list
- ✅ signed "Warmly, Akari team"
- ✅ each button carries this person's own token

### C2 · Jack reviews the heads-up copy  _(Day 0)_

> Jack compares the "nearly at the front" email with his draft (template 3).

- ✅ subject follows Jack's template: "You're Almost Up for an Unlimited Membership at Akari Williamsburg"
- ✅ inbox preview: "A spot could open up any day now"
- ✅ body follows Jack's wording ("close to the front of the line…")
- ✅ states the real hold: 48 hours
- ✅ tells them how to come off the list
- ✅ signed "Warmly, Akari team"
- ✅ Maya's combined heads-up names both memberships
- ✅ a name typed as HTML is shown as text, not rendered
- ✅ two buttons: "I'm still interested" and "Remove me from the waitlist" (Jack, T7)
- ✅ the heads-up buttons carry this person's own token

### R1 · Cleo signs up (Unlimited) — after her mail scanner pre-clicks every link  _(Day 0)_

> Cleo's work email security scanner opens all four links first. Then Cleo clicks "Sign up" and confirms.

- ✅ the scanner's clicks change nothing
- ✅ the link opens a confirmation page showing the hold deadline
- ✅ the confirm button can't be double-submitted (button disables on submit)
- ✅ confirming sends her straight to the Williamsburg Unlimited signup page
- ✅ status → Signed Up
- ✅ she is removed from her Williamsburg Daytime list automatically
- ✅ confirmation subject: "Your Private Sign Up Link for Akari Williamsburg"
- ✅ confirmation preview: "Your Unlimited membership is ready for you"
- ✅ confirmation carries the private signup link
- ✅ Unlimited wording: "we'll automatically remove you from any other Akari waitlists"

### R2 · Ava wants a tour first  _(Day 0)_

> Ava clicks "Tour first" and writes "Weekday evenings after 6".

- ✅ Ava is told her spot is held and sent to Williamsburg's booking page
- ✅ status → Tour Requested, notes saved
- ✅ no team email: she books directly, and Cal.com tells the team (Jack, 13 Nov)

### R3 · Noor is not ready yet  _(Day 0)_

> Noor clicks "Not ready yet" and writes "Back in town in November".

- ✅ the "Not ready yet" page does not say "your spot is held until…" (Jack, T6)
- ✅ Noor is told she stays on the list
- ✅ status → Not Right Now with her reason

### R4 · Guest02 is no longer interested  _(Day 0)_

> Guest02 clicks "No longer interested": "Too far from me".

- ✅ the "No longer interested" page does not say "your spot is held until…" (Jack, T6)
- ✅ status → No Longer Interested with reason
- ✅ no email is sent to them

### R5 · Guest03 signs up for 4-Visit, then leaves the Daytime list  _(Day 0)_

> Guest03 also waits for Williamsburg Daytime. After signing up they use the link in the confirmation to come off the other list.

- ✅ 4-Visit wording: stays on other waitlists, with a link to come off them
- ✅ …and in the HTML email that link sits on the word "here" (Jack, T3)
- ✅ they are still on the Daytime list until they choose
- ✅ the "remove me" link opens a confirmation page first
- ✅ after confirming: removed from Daytime; 4-Visit signup untouched
- ✅ the page says what they were removed from

### R6 · Guest04 says "not ready", then changes their mind within the hour  _(Day 0)_

> Guest04 clicks "Not ready yet", then goes back to the same email and clicks "Sign up".

- ✅ the page does not wrongly say their hold "passed before we heard back"
- ✅ the page tells them they're first in line for the next spot
- ✅ status → Warm (first in line)

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

### R10 · Heads-up replies: one "still interested", one "remove me"  _(Day 0)_

> Zed presses "I'm still interested" in the heads-up. Sam presses "Remove me from the waitlist" and writes "Moved to Queens". Sam is also on Greenpoint Daytime, which is paused, so that list got no heads-up.

- ✅ the link opens a confirmation page first (mail scanners change nothing)
- ✅ Zed: Interest Confirmed At recorded, still Primed (keeps his place)
- ✅ "Still Interested" is logged, so staff can see who confirmed
- ✅ Sam: Greenpoint 4-Visit → No Longer Interested with his reason
- ✅ …his Greenpoint Daytime row (not in that heads-up) is untouched
- ✅ pressing a heads-up button again after removing changes nothing

### S1 · Send Now with a bad key  _(Day 0)_

> Someone edits the Airtable button URL and the key is wrong.

- ✅ refused (403) and nothing sent

### S2 · Jack uses Send Now for an LES pre-opening member  _(Day 0)_

> LES is switched off, but Jack wants to invite Priya now. He clicks the button twice.

- ✅ page: "Invite sent", with the hold deadline
- ✅ Priya → Invited (source: Send Now)
- ✅ second click within 2 minutes is ignored ("Already sent")
- ✅ Priya received exactly one invite
- ✅ invite subject names the location: "…at Akari LES"

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
- ✅ reasons given today are listed (Guest02 and Noor)
- ✅ report is scheduled for 7:30am, before doors open (Jack's spec)
- ✅ subject: "Akari Waitlist Daily Summary: <weekday, date>" (Jack's template 4)
- ✅ layout follows template 4: Hi team → Needs attention → Last 24 hours → By location → dashboard link → Thank you
- ✅ Needs attention lists the four counts
- ✅ Last 24 hours has Jack's six columns
- ✅ By location follows the Capacity table: Williamsburg, Greenpoint, LES, then the new ones
- ✅ the new queues are flagged for set-up under "Details to check"
- ✅ the paused queue is flagged under "Details to check"

### E2 · The hold window ends: unanswered holds time out, the line moves on  _(Day 2 +1h)_

> Guest01, Guest09, Guest10 never replied. Guest04 changed their mind yesterday and was told they're first in line.

- ✅ Guest01, Guest09, Guest10 → No Reply, out of the line (Jack, T8: first miss)
- ✅ Ava's tour hold does not time out
- ✅ Guest04 (told "first in line") is re-invited straight away
- ✅ people who simply ignored us (Guest01/09/10) are not re-invited
- ✅ the paused queue alerts again on a new day (not every hour)
- ✅ Guest11 and Guest12 get their turn
- ✅ Williamsburg Unlimited: no new invite while Cleo's signup awaits Jack's recount and Ava's tour holds the other spot

### S4 · Jack recounts and adds a spot; Guest09 replies late  _(Day 2 +1h)_

> Jack updates Williamsburg Unlimited: Active 39 (Cleo joined), Minimum 41. Guest09 finds yesterday's email and clicks "Sign up".

- ✅ Guest09 is told the hold passed and they're first in line
- ✅ Guest09 is back in line: No Reply → Warm, reply time recorded
- ✅ the paused-queue alert is not repeated within 24 hours
- ✅ the new Williamsburg Unlimited spot goes to Ben (existing member, 121 days waiting)
- ✅ Guest09 (late reply) is re-invited; Guest10 (no reply) is not

### S5 · After Ava's tour, Jack sends her the invite again  _(Day 2 +1h)_

> Ava loved the tour. Jack presses Send Now on her row; Ava uses the new email.

- ✅ page: "Invite sent"
- ✅ the old invite's links stop working (410)
- ✅ Ava → Signed Up, sent to signup

### S6 · A new member fills in the form again  _(Day 2 +1h)_

> Cleo (signed up yesterday) fills in the Typeform again out of habit, ticking Williamsburg Unlimited.

- ✅ she is not put back on the waitlist for the membership she just bought

### E4 · Day 4: unanswered invites drop out  _(Day 5 +1h)_

> Three days later. Guest09 ignored their second invite. Ben ignored his.

- ✅ Guest09 (2nd timeout) → No Reply, out of the line
- ✅ Guest10 (No Reply) stays out of the line until staff put them back
- ✅ Ben timed out → No Reply; the Williamsburg Unlimited spot goes to Maya
- ✅ Maya asks for a tour: held, Tour Requested, no team email (she books directly)

### S7 · Jack puts a No Reply person back in the queue  _(Day 5 +1h)_

> Guest10 phones to say the invite went to spam. Jack changes their Status from No Reply to Warm in Airtable.

- ✅ the next hourly run invites Guest10 first (Warm = front of the line)
- ✅ Guest10 receives a fresh invite email

### D2 · Day 12 report: what has been forgotten?  _(Day 13 +1h)_

> Nobody followed up on Maya's tour. Noor said "not ready" 12 days ago.

- ✅ flags Maya's tour request: no tour time booked, spot still held
- ✅ flags Greenpoint Summer Pass: open spot, nobody left to invite
- ✅ Noor (12 days "not ready") is not yet due a check-in: count is 0

### X1 · The hourly run starts just as people reply  _(Day 13 +1h)_

> Jack uses Send Now for Jo and Leo. Their replies land in the same second the hourly engine starts — more than Airtable's 5 requests/second, so the base locks for 30s.

- ✅ neither person sees a raw error
- ✅ Jo ends Signed Up with one confirmation; Leo ends Not Right Now with his reason
- ✅ any alert from the collision tells Jack it was a temporary rate limit needing no action
- ✅ the next hourly run completes normally

### D3 · Day 62 report: "not ready yet" check-ins  _(Day 63 +1h)_

> Noor said "not ready" 62 days ago; Leo said it 50 days ago.

- ✅ Needs attention counts 1 "not ready yet" person due a check-in
- ✅ the check-in list names Noor with her email, queue and reason
- ✅ Leo (50 days) is not listed yet

### I1 · Data integrity across the whole run  _(Day 63 +1h)_

> What Jack would spot-check in Airtable and the inbox.

- ✅ every dropdown value written is one Airtable already has (no stray options)
- ✅ every Invited row has a 48-character token and a deadline
- ✅ nobody holds two spots at once
- ✅ every Signed Up row has a matching "Signed Up" log
- ✅ no email contains "undefined", "NaN", "null", "[object Object]" or a placeholder token
- ✅ every email has both a plain-text and an HTML version, and a subject
- ✅ the only error alerts all week: the deliberately broken form, plus "temporary rate limit" notices
- ✅ everyone marked Invited actually received an invite email with their current link
- ✅ everyone marked Signed Up who has a signup link was emailed it
- ✅ no rejected Airtable/SendGrid calls (bad formulas, >10-row batches, bad payloads)
- ⚠️ no Airtable rate-limit hits all week — _3 request(s) got HTTP 429_

## Final Airtable state (Waitlist)

| Name | Email | Queue | Status | Timeouts | Source |
|---|---|---|---|---|---|
| Cleo Ortiz | stan+10@optimizewise.org | Williamsburg · Unlimited | Signed Up | 0 | Auto |
| Cleo Ortiz | stan+10@optimizewise.org | Williamsburg · Daytime | Removed | 0 |  |
| Ava Romero | stan+11@optimizewise.org | Williamsburg · Unlimited | Signed Up | 0 | Send Now |
| Ben Fischer | stan+12@optimizewise.org | Williamsburg · Unlimited | No Reply | 1 | Auto |
| Guest01 Test | stan+101@optimizewise.org | Williamsburg · 4-Visit | No Reply | 1 | Auto |
| Guest02 Test | stan+102@optimizewise.org | Williamsburg · 4-Visit | No Longer Interested | 0 | Auto |
| Guest03 Test | stan+103@optimizewise.org | Williamsburg · 4-Visit | Signed Up | 0 | Auto |
| Guest04 Test | stan+104@optimizewise.org | Williamsburg · 4-Visit | No Reply | 1 | Auto |
| Guest05 Test | stan+105@optimizewise.org | Williamsburg · 4-Visit | Signed Up | 0 | Auto |
| Guest06 Test | stan+106@optimizewise.org | Williamsburg · 4-Visit | Signed Up | 0 | Auto |
| Guest07 Test | stan+107@optimizewise.org | Williamsburg · 4-Visit | Signed Up | 0 | Auto |
| Guest08 Test | stan+108@optimizewise.org | Williamsburg · 4-Visit | Signed Up | 0 | Auto |
| Guest09 Test | stan+109@optimizewise.org | Williamsburg · 4-Visit | No Reply | 2 | Auto |
| Guest10 Test | stan+110@optimizewise.org | Williamsburg · 4-Visit | No Reply | 2 | Auto |
| Guest11 Test | stan+111@optimizewise.org | Williamsburg · 4-Visit | No Reply | 1 | Auto |
| Guest12 Test | stan+112@optimizewise.org | Williamsburg · 4-Visit | No Reply | 1 | Auto |
| Guest01 Test | stan+101@optimizewise.org | Greenpoint · Unlimited | Primed | 0 |  |
| Guest03 Test | stan+103@optimizewise.org | Williamsburg · Daytime | Removed | 0 |  |
| Maya Chen | stan+1@optimizewise.org | Williamsburg · Unlimited | Tour Requested | 0 | Auto |
| Leo Brooks | stan+2@optimizewise.org | Williamsburg · Unlimited | Not Right Now | 0 | Send Now |
| Leo Brooks | stan+2@optimizewise.org | Greenpoint · Unlimited | Waiting | 0 |  |
| Priya Shah | stan+3@optimizewise.org | LES · Unlimited | Signed Up | 0 | Send Now |
| Sam O'Connor | stan+4@optimizewise.org | Greenpoint · Daytime | Waiting | 0 |  |
| Sam O'Connor | stan+4@optimizewise.org | Greenpoint · 4-Visit | No Longer Interested | 0 |  |
| Maya Chen | stan+1@optimizewise.org | Williamsburg · Daytime | Primed | 0 |  |
| Noor Haddad | stan+5@optimizewise.org | Greenpoint · Summer Pass | Not Right Now | 0 | Auto |
| bZed/b "Q" | stan+6@optimizewise.org | Williamsburg · Unlimited | Primed | 0 |  |
| Jo Park | stan+7@optimizewise.org | Williamsburg · Unlimited | Signed Up | 0 | Send Now |
| Rae Kim | stan+8@optimizewise.org | All-Access · Unlimited | Waiting | 0 |  |
| Rae Kim | stan+8@optimizewise.org | Akari Yu · Limited 3-Visit/Month | Waiting | 0 |  |

## Inbox (every email sent, in order)

<details><summary>1. <b>[Waitlist automation] Intake: submission broken-1 is missing email, location, membership — check the T</b> → team@YOUR-DOMAIN.com</summary>

```text
Preview: (none)

Workflow: Akari Waitlist Automation v1
Failed node: Parse Typeform
Error: Intake: submission broken-1 is missing email, location, membership — check the Typeform questions [line 106]
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

The cost for your membership will be $220/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:50 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=ccab7e281ec26ec6d76585935c1189d3832fd9d9c66e7776&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=ccab7e281ec26ec6d76585935c1189d3832fd9d9c66e7776&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=ccab7e281ec26ec6d76585935c1189d3832fd9d9c66e7776&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=ccab7e281ec26ec6d76585935c1189d3832fd9d9c66e7776&a=no

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

The cost for your membership will be $220/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:50 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=8790eeb6c55083c6f061af7f7e23428f2787a5af44726838&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=8790eeb6c55083c6f061af7f7e23428f2787a5af44726838&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=8790eeb6c55083c6f061af7f7e23428f2787a5af44726838&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=8790eeb6c55083c6f061af7f7e23428f2787a5af44726838&a=no

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

Additional membership details, including pricing, can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:50 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=bb808a9c490c0e7a47eaddf7cc748ce2da93ad235a790715&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=bb808a9c490c0e7a47eaddf7cc748ce2da93ad235a790715&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=bb808a9c490c0e7a47eaddf7cc748ce2da93ad235a790715&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=bb808a9c490c0e7a47eaddf7cc748ce2da93ad235a790715&a=no

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

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:50 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=5af1af186cd468e280819bee156a33fbf62f409bbc21b822&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=5af1af186cd468e280819bee156a33fbf62f409bbc21b822&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=5af1af186cd468e280819bee156a33fbf62f409bbc21b822&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=5af1af186cd468e280819bee156a33fbf62f409bbc21b822&a=no

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

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:50 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=3e0c82f63e3011361105b961f5c59234f54e945fc868cde6&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=3e0c82f63e3011361105b961f5c59234f54e945fc868cde6&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=3e0c82f63e3011361105b961f5c59234f54e945fc868cde6&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=3e0c82f63e3011361105b961f5c59234f54e945fc868cde6&a=no

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

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:50 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=b91529c0e4726e121c21a717192bd1520e7e797f79f93e5c&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=b91529c0e4726e121c21a717192bd1520e7e797f79f93e5c&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=b91529c0e4726e121c21a717192bd1520e7e797f79f93e5c&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=b91529c0e4726e121c21a717192bd1520e7e797f79f93e5c&a=no

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

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:50 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=4507786a9502618f2e296c61417def4d983b4d3067e842e9&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=4507786a9502618f2e296c61417def4d983b4d3067e842e9&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=4507786a9502618f2e296c61417def4d983b4d3067e842e9&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=4507786a9502618f2e296c61417def4d983b4d3067e842e9&a=no

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

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:50 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=25e6785eb454a0382269dc8f374f2e439595da621089e666&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=25e6785eb454a0382269dc8f374f2e439595da621089e666&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=25e6785eb454a0382269dc8f374f2e439595da621089e666&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=25e6785eb454a0382269dc8f374f2e439595da621089e666&a=no

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

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:50 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=cd8b3b3b266843ca1b952f9074ce516b914f299e9db994a4&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=cd8b3b3b266843ca1b952f9074ce516b914f299e9db994a4&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=cd8b3b3b266843ca1b952f9074ce516b914f299e9db994a4&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=cd8b3b3b266843ca1b952f9074ce516b914f299e9db994a4&a=no

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

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:50 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=39ee3372545929b5fbcc6bff5e5b94776b43dce7d4b05791&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=39ee3372545929b5fbcc6bff5e5b94776b43dce7d4b05791&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=39ee3372545929b5fbcc6bff5e5b94776b43dce7d4b05791&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=39ee3372545929b5fbcc6bff5e5b94776b43dce7d4b05791&a=no

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

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:50 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=8d4ba4687142e7ecde882ac3cb4232f0c9511ed0324ba9d2&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=8d4ba4687142e7ecde882ac3cb4232f0c9511ed0324ba9d2&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=8d4ba4687142e7ecde882ac3cb4232f0c9511ed0324ba9d2&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=8d4ba4687142e7ecde882ac3cb4232f0c9511ed0324ba9d2&a=no

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

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:50 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=b4eb011ed9c421e4a0ec8365a4075e1f9621c37f6504c290&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=b4eb011ed9c421e4a0ec8365a4075e1f9621c37f6504c290&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=b4eb011ed9c421e4a0ec8365a4075e1f9621c37f6504c290&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=b4eb011ed9c421e4a0ec8365a4075e1f9621c37f6504c290&a=no

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

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:50 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=6d5f01311f4d6de5a8500d477022c906115861da69e73e2a&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=6d5f01311f4d6de5a8500d477022c906115861da69e73e2a&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=6d5f01311f4d6de5a8500d477022c906115861da69e73e2a&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=6d5f01311f4d6de5a8500d477022c906115861da69e73e2a&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>15. <b>Check Minimum Members: Greenpoint · Daytime is paused</b> → team@YOUR-DOMAIN.com</summary>

```text
Preview: A queue has been paused until its numbers are checked

Hi team,

The Daytime queue at Akari Greenpoint worked out 490 open spots (Minimum Members 500, Active Members 10). That's more than 15, which usually means a typo, so the system has paused this queue. Nobody has been invited or emailed from it.

If the numbers are wrong, correct them in the Capacity table and invites resume at the next hourly check.

If they're right (for example a new location opening), raise pauseIfOpenSpotsOver in the Config node.

You'll get this reminder at most once a day while the queue stays paused.

Thank you,
Akari team
```
</details>

<details><summary>16. <b>You're Almost Up for an Unlimited Membership at Akari Williamsburg</b> → stan+12@optimizewise.org</summary>

```text
Preview: A spot could open up any day now

Hi Ben,

Thank you for your continued patience on the waitlist for the Unlimited membership at Akari Williamsburg. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.

When it does, we'll send you an email with all the details, and you'll have 48 hours to claim your spot.

If you're still interested, please let us know below so we know you're ready when a spot opens. If your plans have changed, you can remove yourself from the waitlist instead.

I'm still interested: http://localhost:5678/webhook/akari-waitlist/respond?t=99a991d3a68f1240da7239d800b1420fd0a8d0295dd44e9d&a=still
Remove me from the waitlist: http://localhost:5678/webhook/akari-waitlist/respond?t=99a991d3a68f1240da7239d800b1420fd0a8d0295dd44e9d&a=remove

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>17. <b>You're Almost Up for a Membership at Akari Williamsburg</b> → stan+1@optimizewise.org</summary>

```text
Preview: A spot could open up any day now

Hi Maya,

Thank you for your continued patience on the waitlist for the Unlimited membership at Akari Williamsburg and the Daytime membership at Akari Williamsburg. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.

When it does, we'll send you an email with all the details, and you'll have 48 hours to claim your spot.

If you're still interested, please let us know below so we know you're ready when a spot opens. If your plans have changed, you can remove yourself from the waitlist instead.

I'm still interested: http://localhost:5678/webhook/akari-waitlist/respond?t=0616b2fcaf8ce717f9c6f204e7e12397a7ba63e5c5438af1&a=still
Remove me from the waitlist: http://localhost:5678/webhook/akari-waitlist/respond?t=0616b2fcaf8ce717f9c6f204e7e12397a7ba63e5c5438af1&a=remove

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>18. <b>You're Almost Up for an Unlimited Membership at Akari Williamsburg</b> → stan+7@optimizewise.org</summary>

```text
Preview: A spot could open up any day now

Hi Jo,

Thank you for your continued patience on the waitlist for the Unlimited membership at Akari Williamsburg. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.

When it does, we'll send you an email with all the details, and you'll have 48 hours to claim your spot.

If you're still interested, please let us know below so we know you're ready when a spot opens. If your plans have changed, you can remove yourself from the waitlist instead.

I'm still interested: http://localhost:5678/webhook/akari-waitlist/respond?t=24b050f1629659ece1a0a0919d54c5a7bf5218084a8d0823&a=still
Remove me from the waitlist: http://localhost:5678/webhook/akari-waitlist/respond?t=24b050f1629659ece1a0a0919d54c5a7bf5218084a8d0823&a=remove

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>19. <b>You're Almost Up for an Unlimited Membership at Akari Williamsburg</b> → stan+2@optimizewise.org</summary>

```text
Preview: A spot could open up any day now

Hi Leo,

Thank you for your continued patience on the waitlist for the Unlimited membership at Akari Williamsburg. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.

When it does, we'll send you an email with all the details, and you'll have 48 hours to claim your spot.

If you're still interested, please let us know below so we know you're ready when a spot opens. If your plans have changed, you can remove yourself from the waitlist instead.

I'm still interested: http://localhost:5678/webhook/akari-waitlist/respond?t=16d3b74f06071b3d88ff8c09b747d6dea938c22c2225027d&a=still
Remove me from the waitlist: http://localhost:5678/webhook/akari-waitlist/respond?t=16d3b74f06071b3d88ff8c09b747d6dea938c22c2225027d&a=remove

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>20. <b>You're Almost Up for an Unlimited Membership at Akari Williamsburg</b> → stan+6@optimizewise.org</summary>

```text
Preview: A spot could open up any day now

Hi <b>Zed</b>,

Thank you for your continued patience on the waitlist for the Unlimited membership at Akari Williamsburg. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.

When it does, we'll send you an email with all the details, and you'll have 48 hours to claim your spot.

If you're still interested, please let us know below so we know you're ready when a spot opens. If your plans have changed, you can remove yourself from the waitlist instead.

I'm still interested: http://localhost:5678/webhook/akari-waitlist/respond?t=f7f7d14ed3b801c9e19c376deaf839f62c48c8d77d44f77c&a=still
Remove me from the waitlist: http://localhost:5678/webhook/akari-waitlist/respond?t=f7f7d14ed3b801c9e19c376deaf839f62c48c8d77d44f77c&a=remove

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>21. <b>You're Almost Up for a 4-Visit Membership at Akari Greenpoint</b> → stan+4@optimizewise.org</summary>

```text
Preview: A spot could open up any day now

Hi Sam,

Thank you for your continued patience on the waitlist for the 4-Visit membership at Akari Greenpoint. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.

When it does, we'll send you an email with all the details, and you'll have 48 hours to claim your spot.

If you're still interested, please let us know below so we know you're ready when a spot opens. If your plans have changed, you can remove yourself from the waitlist instead.

I'm still interested: http://localhost:5678/webhook/akari-waitlist/respond?t=6f890bfe9c0dfe6a4d65d9bfd3f985d0166513a743b9e9f1&a=still
Remove me from the waitlist: http://localhost:5678/webhook/akari-waitlist/respond?t=6f890bfe9c0dfe6a4d65d9bfd3f985d0166513a743b9e9f1&a=remove

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>22. <b>You're Almost Up for a 4-Visit Membership at Akari Williamsburg</b> → stan+111@optimizewise.org</summary>

```text
Preview: A spot could open up any day now

Hi Guest11,

Thank you for your continued patience on the waitlist for the 4-Visit membership at Akari Williamsburg. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.

When it does, we'll send you an email with all the details, and you'll have 48 hours to claim your spot.

If you're still interested, please let us know below so we know you're ready when a spot opens. If your plans have changed, you can remove yourself from the waitlist instead.

I'm still interested: http://localhost:5678/webhook/akari-waitlist/respond?t=123faa4f8596dc49d5f8087797276d780fb7a2fbd4bfd053&a=still
Remove me from the waitlist: http://localhost:5678/webhook/akari-waitlist/respond?t=123faa4f8596dc49d5f8087797276d780fb7a2fbd4bfd053&a=remove

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>23. <b>You're Almost Up for a 4-Visit Membership at Akari Williamsburg</b> → stan+112@optimizewise.org</summary>

```text
Preview: A spot could open up any day now

Hi Guest12,

Thank you for your continued patience on the waitlist for the 4-Visit membership at Akari Williamsburg. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.

When it does, we'll send you an email with all the details, and you'll have 48 hours to claim your spot.

If you're still interested, please let us know below so we know you're ready when a spot opens. If your plans have changed, you can remove yourself from the waitlist instead.

I'm still interested: http://localhost:5678/webhook/akari-waitlist/respond?t=e5e315b88822cffcb22b246e1249a63c4e25b5be428ff187&a=still
Remove me from the waitlist: http://localhost:5678/webhook/akari-waitlist/respond?t=e5e315b88822cffcb22b246e1249a63c4e25b5be428ff187&a=remove

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>24. <b>Your Private Sign Up Link for Akari Williamsburg</b> → stan+10@optimizewise.org</summary>

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

<details><summary>25. <b>Your Private Sign Up Link for Akari Williamsburg</b> → stan+103@optimizewise.org</summary>

```text
Preview: Your 4-Visit membership is ready for you

Hi Guest03,

Thank you for your interest in joining Akari! Here is your private sign up link for your 4-Visit membership at Akari Williamsburg: https://app.glofox.test/signup/wb-4v

You'll stay on any other Akari waitlists you've joined. If you'd rather come off them, you can remove yourself here: http://localhost:5678/webhook/akari-waitlist/respond?t=b91529c0e4726e121c21a717192bd1520e7e797f79f93e5c&a=leave

Please let us know if you have any issues signing up!

Warmly,
Akari team
```
</details>

<details><summary>26. <b>Your Private Sign Up Link for Akari Williamsburg</b> → stan+106@optimizewise.org</summary>

```text
Preview: Your 4-Visit membership is ready for you

Hi Guest06,

Thank you for your interest in joining Akari! Here is your private sign up link for your 4-Visit membership at Akari Williamsburg: https://app.glofox.test/signup/wb-4v



Please let us know if you have any issues signing up!

Warmly,
Akari team
```
</details>

<details><summary>27. <b>Your Private Sign Up Link for Akari Williamsburg</b> → stan+105@optimizewise.org</summary>

```text
Preview: Your 4-Visit membership is ready for you

Hi Guest05,

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

<details><summary>30. <b>Unlimited Membership Now Available at Akari LES</b> → stan+3@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Priya,

We really appreciate your patience during the waitlist process for the Unlimited membership at Akari LES. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $220/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:54 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=8d339b2149c301a0378ce26be5435849f4bdd64f264e41b6&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=8d339b2149c301a0378ce26be5435849f4bdd64f264e41b6&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=8d339b2149c301a0378ce26be5435849f4bdd64f264e41b6&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=8d339b2149c301a0378ce26be5435849f4bdd64f264e41b6&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>31. <b>Your Private Sign Up Link for Akari LES</b> → stan+3@optimizewise.org</summary>

```text
Preview: Your Unlimited membership is ready for you

Hi Priya,

Thank you for your interest in joining Akari! Here is your private sign up link for your Unlimited membership at Akari LES: (signup link pending — we'll send it shortly)



Please let us know if you have any issues signing up!

Warmly,
Akari team
```
</details>

<details><summary>32. <b>Akari Waitlist Daily Summary: Thursday, November 12</b> → team@YOUR-DOMAIN.com</summary>

```text
Preview: Today&#39;s waitlist activity and action items

Hi team,

Here is today's waitlist summary. Anything that needs attention is listed first, so if all 4 lines below read zero, there's nothing to action today.

Needs attention
Invites expiring in the next 24 hours: 0
Tour requests not yet booked: 1
Open spots with no invite sent: 494
"Not ready yet" people due a check-in (60+ days): 0

Last 24 hours
New sign-ups: 12
Invites sent: 14
Accepted: 7
Passed: 4
Expired: 0
Tour requests: 1

By location (on waitlist / open spots / invites out)
Williamsburg: 9 / 2 / 3
Greenpoint: 3 / 492 / 0
LES: 0 / 0 / 0
All-Access: 1 / 0 / 0
Akari Yu: 1 / 0 / 0

The full waitlist and history: https://airtable.com/appE2ETEST000001

Details to check
- Greenpoint · 4-Visit: no Signup URL, so no invites are being sent.
- Greenpoint · 4-Visit: 1 open spot(s) but nobody left on the waitlist.
- Greenpoint · Summer Pass: 1 open spot(s) but nobody left on the waitlist.
- Greenpoint · Daytime: paused — 490 open spots is more than 15, so no invites are being sent. Check Minimum Members.
- All-Access · Unlimited: new from the form, 1 on the waitlist. To start inviting, set Minimum Members, Active Members and Signup URL on its Capacity row, then tick Enabled.
- Akari Yu · Limited 3-Visit/Month: new from the form, 1 on the waitlist. To start inviting, set Minimum Members, Active Members and Signup URL on its Capacity row, then tick Enabled.
- stan+3@optimizewise.org signed up for Unlimited at LES but no signup link was configured — send it manually.

Thank you,
Akari team
```
</details>

<details><summary>33. <b>4-Visit Membership Now Available at Akari Williamsburg</b> → stan+104@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Guest04,

We really appreciate your patience during the waitlist process for the 4-Visit membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:55 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=aff25f77699a94caa977433fa7448c17eea7f7ddd9495c5c&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=aff25f77699a94caa977433fa7448c17eea7f7ddd9495c5c&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=aff25f77699a94caa977433fa7448c17eea7f7ddd9495c5c&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=aff25f77699a94caa977433fa7448c17eea7f7ddd9495c5c&a=no

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

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:55 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=2b8eea6f278ca221b643fa53e074712829b213ce991a4f73&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=2b8eea6f278ca221b643fa53e074712829b213ce991a4f73&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=2b8eea6f278ca221b643fa53e074712829b213ce991a4f73&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=2b8eea6f278ca221b643fa53e074712829b213ce991a4f73&a=no

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

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:55 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=cf9874bc44d9032831487dfb833a1b61172d2f4311328f76&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=cf9874bc44d9032831487dfb833a1b61172d2f4311328f76&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=cf9874bc44d9032831487dfb833a1b61172d2f4311328f76&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=cf9874bc44d9032831487dfb833a1b61172d2f4311328f76&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>36. <b>Check Minimum Members: Greenpoint · Daytime is paused</b> → team@YOUR-DOMAIN.com</summary>

```text
Preview: A queue has been paused until its numbers are checked

Hi team,

The Daytime queue at Akari Greenpoint worked out 490 open spots (Minimum Members 500, Active Members 10). That's more than 15, which usually means a typo, so the system has paused this queue. Nobody has been invited or emailed from it.

If the numbers are wrong, correct them in the Capacity table and invites resume at the next hourly check.

If they're right (for example a new location opening), raise pauseIfOpenSpotsOver in the Config node.

You'll get this reminder at most once a day while the queue stays paused.

Thank you,
Akari team
```
</details>

<details><summary>37. <b>You're Almost Up for an Unlimited Membership at Akari Greenpoint</b> → stan+101@optimizewise.org</summary>

```text
Preview: A spot could open up any day now

Hi Guest01,

Thank you for your continued patience on the waitlist for the Unlimited membership at Akari Greenpoint. We wanted to give you a heads up that you're now close to the front of the line, and a spot could open up any day now.

When it does, we'll send you an email with all the details, and you'll have 48 hours to claim your spot.

If you're still interested, please let us know below so we know you're ready when a spot opens. If your plans have changed, you can remove yourself from the waitlist instead.

I'm still interested: http://localhost:5678/webhook/akari-waitlist/respond?t=9716e70dbac9e01118e7da07d358a124c37b0c07087b76d4&a=still
Remove me from the waitlist: http://localhost:5678/webhook/akari-waitlist/respond?t=9716e70dbac9e01118e7da07d358a124c37b0c07087b76d4&a=remove

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>38. <b>Unlimited Membership Now Available at Akari Williamsburg</b> → stan+12@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Ben,

We really appreciate your patience during the waitlist process for the Unlimited membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $220/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:55 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=6dcb0e34a57f3aefdf52b973c527057c6b76da418aa6597a&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=6dcb0e34a57f3aefdf52b973c527057c6b76da418aa6597a&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=6dcb0e34a57f3aefdf52b973c527057c6b76da418aa6597a&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=6dcb0e34a57f3aefdf52b973c527057c6b76da418aa6597a&a=no

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

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:55 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=77663285931d4a9f577c86d01364710705adc6e9603d42cc&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=77663285931d4a9f577c86d01364710705adc6e9603d42cc&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=77663285931d4a9f577c86d01364710705adc6e9603d42cc&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=77663285931d4a9f577c86d01364710705adc6e9603d42cc&a=no

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

The cost for your membership will be $220/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:55 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=91ea1ba37344e8790635240d6e8411edcb3a705074222f68&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=91ea1ba37344e8790635240d6e8411edcb3a705074222f68&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=91ea1ba37344e8790635240d6e8411edcb3a705074222f68&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=91ea1ba37344e8790635240d6e8411edcb3a705074222f68&a=no

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

<details><summary>42. <b>Unlimited Membership Now Available at Akari Williamsburg</b> → stan+1@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Maya,

We really appreciate your patience during the waitlist process for the Unlimited membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $220/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:55 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=6e4c8934a7b2bb9fbf345c96ac166e2b8d2e535010e5b74d&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=6e4c8934a7b2bb9fbf345c96ac166e2b8d2e535010e5b74d&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=6e4c8934a7b2bb9fbf345c96ac166e2b8d2e535010e5b74d&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=6e4c8934a7b2bb9fbf345c96ac166e2b8d2e535010e5b74d&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>43. <b>Check Minimum Members: Greenpoint · Daytime is paused</b> → team@YOUR-DOMAIN.com</summary>

```text
Preview: A queue has been paused until its numbers are checked

Hi team,

The Daytime queue at Akari Greenpoint worked out 490 open spots (Minimum Members 500, Active Members 10). That's more than 15, which usually means a typo, so the system has paused this queue. Nobody has been invited or emailed from it.

If the numbers are wrong, correct them in the Capacity table and invites resume at the next hourly check.

If they're right (for example a new location opening), raise pauseIfOpenSpotsOver in the Config node.

You'll get this reminder at most once a day while the queue stays paused.

Thank you,
Akari team
```
</details>

<details><summary>44. <b>4-Visit Membership Now Available at Akari Williamsburg</b> → stan+110@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Guest10,

We really appreciate your patience during the waitlist process for the 4-Visit membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $140/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:55 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=3766fa6a7577f4b98688da0a7279fc281ac2d426afd58a09&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=3766fa6a7577f4b98688da0a7279fc281ac2d426afd58a09&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=3766fa6a7577f4b98688da0a7279fc281ac2d426afd58a09&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=3766fa6a7577f4b98688da0a7279fc281ac2d426afd58a09&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>45. <b>Akari Waitlist Daily Summary: Thursday, November 12</b> → team@YOUR-DOMAIN.com</summary>

```text
Preview: Today&#39;s waitlist activity and action items

Hi team,

Here is today's waitlist summary. Anything that needs attention is listed first, so if all 4 lines below read zero, there's nothing to action today.

Needs attention
Invites expiring in the next 24 hours: 0
Tour requests not yet booked: 1
Open spots with no invite sent: 496
"Not ready yet" people due a check-in (60+ days): 0

Last 24 hours
New sign-ups: 0
Invites sent: 0
Accepted: 0
Passed: 0
Expired: 0
Tour requests: 0

By location (on waitlist / open spots / invites out)
Williamsburg: 4 / 4 / 1
Greenpoint: 3 / 492 / 0
LES: 0 / 0 / 0
All-Access: 1 / 0 / 0
Akari Yu: 1 / 0 / 0

The full waitlist and history: https://airtable.com/appE2ETEST000001

Details to check
- Greenpoint · 4-Visit: no Signup URL, so no invites are being sent.
- Greenpoint · 4-Visit: 1 open spot(s) but nobody left on the waitlist.
- Greenpoint · Summer Pass: 1 open spot(s) but nobody left on the waitlist.
- Williamsburg · 4-Visit: 4 open spot(s) but nobody left on the waitlist.
- Greenpoint · Daytime: paused — 490 open spots is more than 15, so no invites are being sent. Check Minimum Members.
- All-Access · Unlimited: new from the form, 1 on the waitlist. To start inviting, set Minimum Members, Active Members and Signup URL on its Capacity row, then tick Enabled.
- Akari Yu · Limited 3-Visit/Month: new from the form, 1 on the waitlist. To start inviting, set Minimum Members, Active Members and Signup URL on its Capacity row, then tick Enabled.
- Maya Chen (Unlimited at Williamsburg) asked for a tour on Wed, Nov 4, 10:55 PM EST and has no tour time booked yet. Their spot is still held.

Thank you,
Akari team
```
</details>

<details><summary>46. <b>Unlimited Membership Now Available at Akari Williamsburg</b> → stan+7@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Jo,

We really appreciate your patience during the waitlist process for the Unlimited membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $220/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:55 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=ac1c6d048ebdef31e983ed647460d8c4b3f4c3b1cfc8c164&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=ac1c6d048ebdef31e983ed647460d8c4b3f4c3b1cfc8c164&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=ac1c6d048ebdef31e983ed647460d8c4b3f4c3b1cfc8c164&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=ac1c6d048ebdef31e983ed647460d8c4b3f4c3b1cfc8c164&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>47. <b>Unlimited Membership Now Available at Akari Williamsburg</b> → stan+2@optimizewise.org</summary>

```text
Preview: Your spot is available for a limited time

Hi Leo,

We really appreciate your patience during the waitlist process for the Unlimited membership at Akari Williamsburg. We are in the process of opening more memberships this month, and we would love to have you join us!

The cost for your membership will be $220/month, and additional membership details can be found on our membership page here https://www.akarisauna.com/membership. We'll hold it for you until Sat, Nov 14, 10:55 PM EST. After that it goes to the next person in line.

Please let us know how you would like to proceed below:
Sign up: http://localhost:5678/webhook/akari-waitlist/respond?t=dc732aa4390f8817872480db726619c54478dcb0b56ee5dc&a=yes
Tour first: http://localhost:5678/webhook/akari-waitlist/respond?t=dc732aa4390f8817872480db726619c54478dcb0b56ee5dc&a=tour (we'll find a time for you to come see the space before you commit)
Not ready yet: http://localhost:5678/webhook/akari-waitlist/respond?t=dc732aa4390f8817872480db726619c54478dcb0b56ee5dc&a=notnow (we'll keep you on the waitlist and check back in with you down the road)
No longer interested: http://localhost:5678/webhook/akari-waitlist/respond?t=dc732aa4390f8817872480db726619c54478dcb0b56ee5dc&a=no

If you are waiting for another membership type, and would like to sign up for this one in the meantime, please feel free to do so, and we will keep you on the waitlist for your preferred membership.

For any questions about the membership or Akari in general, please reply to this email and we will get back to you shortly.

We look forward to welcoming you soon!

Warmly,
Akari team
```
</details>

<details><summary>48. <b>Check Minimum Members: Greenpoint · Daytime is paused</b> → team@YOUR-DOMAIN.com</summary>

```text
Preview: A queue has been paused until its numbers are checked

Hi team,

The Daytime queue at Akari Greenpoint worked out 490 open spots (Minimum Members 500, Active Members 10). That's more than 15, which usually means a typo, so the system has paused this queue. Nobody has been invited or emailed from it.

If the numbers are wrong, correct them in the Capacity table and invites resume at the next hourly check.

If they're right (for example a new location opening), raise pauseIfOpenSpotsOver in the Config node.

You'll get this reminder at most once a day while the queue stays paused.

Thank you,
Akari team
```
</details>

<details><summary>49. <b>Your Private Sign Up Link for Akari Williamsburg</b> → stan+7@optimizewise.org</summary>

```text
Preview: Your Unlimited membership is ready for you

Hi Jo,

Thank you for your interest in joining Akari! Here is your private sign up link for your Unlimited membership at Akari Williamsburg: https://app.glofox.test/signup/wb-unl



Please let us know if you have any issues signing up!

Warmly,
Akari team
```
</details>

<details><summary>50. <b>Akari Waitlist Daily Summary: Thursday, November 12</b> → team@YOUR-DOMAIN.com</summary>

```text
Preview: Today&#39;s waitlist activity and action items

Hi team,

Here is today's waitlist summary. Anything that needs attention is listed first, so if all 4 lines below read zero, there's nothing to action today.

Needs attention
Invites expiring in the next 24 hours: 0
Tour requests not yet booked: 1
Open spots with no invite sent: 502
"Not ready yet" people due a check-in (60+ days): 1

Last 24 hours
New sign-ups: 0
Invites sent: 0
Accepted: 0
Passed: 0
Expired: 0
Tour requests: 0

By location (on waitlist / open spots / invites out)
Williamsburg: 2 / 10 / 0
Greenpoint: 3 / 492 / 0
LES: 0 / 0 / 0
All-Access: 1 / 0 / 0
Akari Yu: 1 / 0 / 0

The full waitlist and history: https://airtable.com/appE2ETEST000001

Details to check
- Greenpoint · 4-Visit: no Signup URL, so no invites are being sent.
- Greenpoint · 4-Visit: 1 open spot(s) but nobody left on the waitlist.
- Greenpoint · Summer Pass: 1 open spot(s) but nobody left on the waitlist.
- Williamsburg · 4-Visit: 10 open spot(s) but nobody left on the waitlist.
- Greenpoint · Daytime: paused — 490 open spots is more than 15, so no invites are being sent. Check Minimum Members.
- All-Access · Unlimited: new from the form, 1 on the waitlist. To start inviting, set Minimum Members, Active Members and Signup URL on its Capacity row, then tick Enabled.
- Akari Yu · Limited 3-Visit/Month: new from the form, 1 on the waitlist. To start inviting, set Minimum Members, Active Members and Signup URL on its Capacity row, then tick Enabled.
- Maya Chen (Unlimited at Williamsburg) asked for a tour on Tue, Sep 15, 11:55 PM EDT and has no tour time booked yet. Their spot is still held.

"Not ready yet" for 60+ days
- Noor Haddad (stan+5@optimizewise.org), Summer Pass at Greenpoint, since Thu, Sep 10, 10:50 PM EDT

Thank you,
Akari team
```
</details>

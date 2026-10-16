---
slug: consent-as-data-patient-owned-records
title: Consent as data, designing a patient-owned health record for Doctor OS
date: 2026-10-14
tags: architecture, security, postgresql, healthcare
description: A Patient Passport that follows the patient across clinics, with sharing they control. The data model, the token design and the one rule that keeps it safe.
---

In India a patient's history is scattered across every clinic and lab they've visited, usually on paper. Doctor OS, the clinic software I'm building, includes a **Patient Passport**: one record per patient that spans every clinic using the product, which the *patient* controls. Building it meant treating consent not as a checkbox at sign-up, but as data the system checks on every read.

## Requests, grants and scopes

Three tables carry the whole model:

```
access_requests   what a clinic asked for   (patient, clinic, doctor, scopes, reason)
access_grants     what the patient allowed  (subset of the request, expiry or "until revoked")
access_events     who looked at what, when  (patient-facing history)
```

A grant is scoped to a specific **patient, clinic and doctor**, and to record types: notes, prescriptions, reports or documents. Crucially, a grant can never be wider than its request. The patient can only narrow what was asked, never accidentally widen it.

```sql
-- every clinic-side read of Passport data goes through this check
SELECT 1 FROM access_grants
WHERE patient_id = $1 AND clinic_id = $2 AND doctor_id = $3
  AND $4 = ANY(scopes)
  AND revoked_at IS NULL
  AND (expires_at IS NULL OR expires_at > now());
```

## One place decides what a scope reveals

The rule that matters most: **exactly one service decides what each scope reveals**, and every surface uses it, whether that's the patient's own view, a clinic viewing granted records or a share link. If the logic lived in three places, it would drift, and a privacy bug in any one of them would be a real breach. Clinic views also read the *immutable prescription snapshot* as issued, never live drafts, and never another doctor's private notes.

## Separate tokens for separate surfaces

Doctor OS has three kinds of users, and each gets tokens from a different issuer:

| Surface | Issuer | Can call |
|---|---|---|
| Clinic staff | `doctoros` | staff APIs |
| Patient Passport | `doctoros-passport` | the patient's own record |
| Share-link viewer | `doctoros-share` | only the records in that link |

A token is verified against the issuer the route expects, so a patient token can never call a staff API, even if someone forgets a role check. Defence comes from the structure, not from remembering.

## Share links for doctors outside the system

Patients often see doctors who don't use Doctor OS. A share link holds a random slug and the exact record IDs the patient picked, with an expiry, and optionally restricted to one mobile number. Opening it requires an OTP; verification returns a 30-minute viewer token. Revoking the link, or its expiry, stops access immediately, even mid-session, because every request re-checks the link.

## Access history the patient can read

Every view, grant, decline, revoke, link creation and link open is written to `access_events`, which the patient sees in their app. This is separate from the clinic's internal audit log on purpose: it's written for the patient, in plain language. Being able to see "Dr. Kulkarni viewed your prescriptions on 3 Oct" builds more trust than any privacy policy.

## Stateless, like everything else

Grants, links, OTPs and sessions all live in PostgreSQL, so the API stays stateless and any replica can serve any request. That keeps scaling simple: add replicas behind the load balancer and you're done.

## What I'd tell anyone building something similar

Model consent **explicitly** (requests, grants, expiries), centralise the reveal logic in **one function**, isolate token issuers per **surface**, and give users a **readable history** of access. None of it is exotic. It just has to be designed in from day one, because retrofitting consent onto a record system almost never works.

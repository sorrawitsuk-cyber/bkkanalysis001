# Decision 0005: Fail-closed boundary authorization contract

Date: 2026-07-29
Status: Accepted

## Context

The official BMA district geometry has passed technical QA, but its Bangkok Open
Data resource still states `License not specified`. Geometry promotion, derived
tiles and district-level NDVI therefore remain blocked.

An email reply or permission document is not sufficient provenance on its own.
The processing pipeline also needs an exact binding between the authorization,
the reviewed source snapshot, the granted operations and the required
attribution.

## Decision

Authorization is represented by
`observatory-boundary-authorization/v1` and stored internally in Supabase. The
record binds the decision to:

- the registry dataset and resource IDs;
- the official HTTPS source URL and reviewed SHA-256;
- the approving organization, response signer and role;
- a reference and SHA-256 for the original permission artifact;
- explicit permissions for analysis, transformation, private retention,
  source redistribution, derived redistribution, tiles and district statistics;
- the license name, attribution wording, authoritative version and update
  cadence.

The gate is fail-closed. `approved` is the only decision that may use
`gateStatus: open`. All permissions required for derived public products must be
`true`; the source-redistribution decision must be recorded explicitly as
`true` or `false`. Pending, rejected, revoked and expired evidence keeps the
gate blocked.

Authorization rows have RLS enabled and no anonymous or authenticated grants.
Only the service role may synchronize reviewed records. The original
correspondence is not committed to the repository; the record stores its
restricted reference and checksum.

## Consequences

- Registry validation and boundary intake remain blocked while the current
  authorization is pending.
- Supabase may store the pending review without exposing it publicly.
- Receiving a reply does not automatically promote geometry. A second review
  must normalize the response into the contract and pass the approval command.
- Revocation or expiry can close the gate without deleting the audit record.

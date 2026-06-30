## ISSUE

i am trying to run this sql in the web tab:

SELECT
  id,
  given_name,
  family_name,
  nicknames,
  primary_contact_u_u_i_d,
  length(phones_json) AS pj,
  length(emails_json) AS ej,
  data_source_name
FROM
  contacts

but is is showing this warning
> 
  > Only read-only SQL is allowed (SELECT or WITH ... SELECT). INSERT/UPDATE/DELETE and DDL are rejected.

 ## REASON:
  Bug: sql_validator.dart:191 required a literal space after the verb — startsWith('SELECT '). Your query has a newline after SELECT, so the check failed and rejected a valid read-only query. Any multi-line SELECT/WITH (the default pretty-printed format) hit this.

## FIX:

The prefix check now accepts any whitespace after the verb: RegExp(r'^(SELECT|WITH)\s').

sql_validator.dart — whitespace-aware prefix check.

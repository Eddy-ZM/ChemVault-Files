# Permissions

Scope combines the verified actor, owner, domain/default roles, explicit file roles, visibility, share state, deletion state, and malware state. D1 lacks RLS; server functions are the enforcement layer.

| Resource/operation | Public/anonymous | Authenticated viewer | Writer | Owner/admin | Machine service |
| --- | --- | --- | --- | --- | --- |
| List/read private file | Deny | Explicit/effective read | Allow | Allow | Lifecycle only |
| Create/update/move | Deny | Deny | Granted scope | Allow | Artifact API only |
| Share/public link | Valid active token and clean file only | Read if policy allows | Deny unless granted | Create/revoke | Deny |
| Delete/restore/permanent delete | Deny | Deny | Deny unless granted | Allow own/admin | Lifecycle delete |
| Lab handoff | Deny | Owner-authorized clean file | Same | Same | Lab validates signed handoff |
| Scanner read/callback | Deny | Deny | Deny | Deny | `FILE_SCAN_CALLBACK_SECRET` only |
| Derived artifact write | Deny | Deny | Deny | Initiates through Lab | `ARTIFACT_WRITE_SECRET` only |

The four machine credentials are not interchangeable. Public visibility or a share token never bypasses quarantine.

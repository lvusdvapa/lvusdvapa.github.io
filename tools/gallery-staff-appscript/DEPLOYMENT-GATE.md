# Deployment gate: DO NOT PUBLISH UNTIL THESE ARE COMPLETE

- [ ] LVUSD Workspace administrator verifies that web app `Session.getActiveUser().getEmail()` resolves correctly for the district's domain-restricted deployment. Fail closed for blanks.
- [ ] LVUSD Workspace administrator configures reviewer, administrator, elementary, and secondary VAPA Google Groups and confirms the deploying account may run `AdminDirectory.Members.hasMember`.
- [ ] Private intake folder and PRIVATE staff submissions spreadsheet created and restricted; production public gallery sheet remains separate.
- [ ] District confirms the publication rights/consent process, displays only authorized artist credits, handles image EXIF metadata, and approves public image sharing method.
- [ ] Public gallery feed is hardened to select the `Sheet1` tab explicitly, and returns only published records. The legacy Apps Script endpoint must stay unchanged until its own test pass.
- [ ] Non-student test upload passes for elementary/secondary teacher, admin reviewer, unauthorized LVUSD employee, non-LVUSD account, and revocation scenario.
- [ ] Test uploads stay private until publish. Publish appears on public test feed and unpublish removes it and revokes image sharing.
- [ ] Review in Chrome, Safari and mobile. Confirm user-friendly error handling and quota limits.
- [ ] Security review of Apps Script deployment, delegated directory rights, Drive sharing, and audit logging.
- [ ] Only after passing: approve production configuration and replace Staff Resources demo link with the authenticated Apps Script web app URL.

**This work is a staging implementation.** No current server, Google Sheet, Drive folder, GitHub main branch or public feed was changed by the backend package.

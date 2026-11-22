# Authenticated LVUSD Art Gallery Management — staging

**Status: implementation prepared and tested locally; not deployed.** The public Visual Arts gallery and live Google services remain unchanged.

The separate staff app is designed to run as an LVUSD-domain-restricted Google Apps Script web app using `google.script.run`, with server-side Google Workspace group checks on every operation.

Workflow: elementary or secondary VAPA teacher submits an artwork image privately → authorized reviewer approves → reviewer publishes the artwork to the public gallery's existing read-only feed → reviewer may later unpublish.

Security requirements:
- Private staff submissions spreadsheet must be **separate** from the public Gallery spreadsheet.
- Google Drive intake is private until publication approval.
- School and grade/year metadata validated server-side; only genuine JPG/PNG/WebP accepted.
- Teachers can see their own submissions; reviewers are group-authorized.
- External and unauthorized district accounts are denied.
- Public image sharing is disabled unless district policy explicitly permits it.
- The existing Apps Script public feed should be hardened to select `Sheet1` explicitly before any production deployment.

Testing: staging backend passed 16 mocked authorization, upload, approval, publication, and unpublishing assertions. Real Workspace SSO/group and Drive/Sheets integration still need an LVUSD administrator and a separate test environment.

The standalone source and test package is supplied in the ChatGPT conversation as **LVUSDVAPA-Secure-Gallery-Backend-Staging.zip**. No production service was modified.

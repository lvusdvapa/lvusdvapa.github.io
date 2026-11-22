# LVUSD Student Art Collection: authenticated staff application (staging)

**Status (2026-11-22, 07:48 PT): LIVE.** The deployment linked from Staff Resources on the production site (`main`, Apps Script project "LVUSDVAPA Art Gallery – TEST ONLY.", deployment `AKfycbx8gru5…`) now publishes to the production **Art Gallery** sheet, which feeds the public Visual Arts page. Pilot email allowlist access is unchanged. A full end-to-end run was completed first against the TEST sheets/folder (see Test record below).

Production Script Properties:
- `PUBLIC_GALLERY_SHEET_ID` = production "Art Gallery" sheet (backup copy: "Art Gallery - BACKUP before staff app go-live 2026-11-22")
- `STAFF_SUBMISSIONS_SHEET_ID` / `PRIVATE_INTAKE_FOLDER_ID` = "LVUSDVAPA - PRIVATE Staff Submissions (production)" and "Private Artwork Intake (production)", in the folder "LVUSDVAPA Art Gallery - PRODUCTION Staff (private)"
- `DISTRICT_APPROVED_PUBLIC_SHARING=YES`, `PILOT_EMAIL_ONLY=YES` (allowlist + reviewer list unchanged)

The three legacy sample artworks in the Art Gallery sheet have no private submission record, so the dashboard can't unpublish them. Edit those rows in the sheet directly.

## Staff dashboard (Staff.html)

`Staff.html` reproduces the original `staff/art-gallery.html` management dashboard (same CSS design system) and calls only real server functions via `google.script.run`. Nothing is stored in localStorage.

| Feature | Server function(s) |
|---|---|
| Header identity/role, metrics, table + grid views, search/school/grade/year/status filters | `getStaffBootstrap` |
| Drive thumbnails in table/grid | `getArtworkThumbnails` (Drive thumbnail, falls back to the original) |
| Full-resolution preview (lightbox and edit panel) | `getArtworkImage`, which returns the original Drive bytes. Files are never made public just to preview them. |
| 3-step upload (Files → Details → Review, per-image titles, per-file progress/retry) | `submitArtwork` (one call per image, 8 MB cap, magic-byte check, saved-size verification) |
| Edit panel | `updateArtwork`: teachers can edit their own Pending/Needs Changes work, which re-queues it. Reviewers can edit any non-archived work, and edits to Published work also update the public row. |
| Approve / Request changes / Publish / Unpublish / Archive / Restore | `reviewArtwork` (reviewer/admin only, enforced server-side) |
| Bulk selection bar | `reviewArtworks` (per-item validation) |
| Public gallery feed panel | `getPublicGalleryPreview` (reads the configured public sheet; images via the public `lh3.googleusercontent.com/d/<id>` link the Visual Arts page uses) |

### Test record
- Offline: `node tests/security.spec.cjs` (16), `node tests/workflow.spec.cjs` (47), `npm i jsdom && node tests/ui.spec.cjs` (32). The UI test drives the real Staff.html against the real Code.gs on mocked Google services.
- Live TEST run (cbloom@lvusd.org, pilot reviewer): upload (Drive file private, byte-for-byte size match) → full-res preview (956×492 original) → edit → approve → publish (public sheet row written; image fetched anonymously with HTTP 200) → feed panel → unpublish (row removed, Drive file PRIVATE, anonymous fetch fails). `DISTRICT_APPROVED_PUBLIC_SHARING` was set to YES only for the run and then returned to NO.
- The TEST project runs in pilot mode (`PILOT_EMAIL_ONLY=YES`); its live manifest has no Admin Directory service. Group-based roles were tested only offline.

## Architecture

- Public Visual Arts page: anonymous/read-only, uses the *existing* Google Apps Script `/exec` JSON feed and existing sheet tab (`Sheet1`). No sign-in.
- Staff Resources → staff app: separate Google Apps Script Web App. The browser sees Google Workspace sign-in controlled by the web app's `DOMAIN` access configuration; all privileged `google.script.run` methods enforce a server-side allowlist/group check.
- Submissions: restricted Google Drive folder plus `StaffSubmissions` tab in a separate **PRIVATE staff spreadsheet**. Private until published.
- Review: authorized teacher submissions queue for designated reviewer; only reviewer/admin can approve/publish. `Published` rows are appended to the legacy public sheet, matching headers by name. Public file is shared with link only at publish (requires district approval).
- Reversal: authorized reviewer can unpublish, delete the matching public row, and restore private Drive sharing.

## Admin setup in a separate TEST environment (required before using real students)

1. District Google Workspace administrator creates/approves 4 Google Groups and maintains memberships: **elementary classroom teachers**, **secondary VAPA teachers**, **gallery reviewers**, and **gallery administrators**. Group emails are deployment configuration, not stored in the public repo.
2. Create a TEST PUBLIC Google Sheet with a `Sheet1` tab containing `Title | Artist | School | Grade | school_year_created | Style | Medium | file_id`, and a completely separate PRIVATE TEST submissions spreadsheet; create a private TEST Drive intake folder. Share private resources only with the deployment owner. Never point to the production spreadsheet in the initial testing period.
3. Create a **separate** Apps Script project, not the existing public-feed project. Add `Code.gs`, `Staff.html`, and manifest. In Project Settings expose `appsscript.json` and enable the **Admin Directory** advanced service. The project deployer needs sufficient Workspace Admin Directory permissions to read group membership. Test that `Session.getActiveUser().getEmail()` identifies a same-domain user; if it returns blank, fail closed and redesign deployment rather than weakening the check.
4. Configure these Script Properties in Apps Script: `STAFF_SUBMISSIONS_SHEET_ID`, `PUBLIC_GALLERY_SHEET_ID`, `PRIVATE_INTAKE_FOLDER_ID`, `PUBLIC_GALLERY_TAB=Sheet1`, `ELEMENTARY_TEACHERS_GROUP`, `SECONDARY_VAPA_GROUP`, `GALLERY_REVIEWERS_GROUP`, `GALLERY_ADMINS_GROUP`. For controlled pilot access only, `PILOT_ALLOWED_EMAILS` may contain comma-separated verified LVUSD staff accounts; this *does not* grant review privileges.
5. Set `DISTRICT_APPROVED_PUBLIC_SHARING=NO` until district policy permits **anyone-with-link** artwork publication. Once cleared, change to `YES` in the TEST deployment. If this policy isn't permitted, develop a district-approved public image server instead; do not bypass Google Drive restrictions.
6. Deploy web app with **Execute as: Me (deploying authorized account)**, **Who has access: Anyone within LVUSD domain**. Never use Anyone or Anyone anonymous. All exposed server functions validate the actual active-user identity and group membership *on every call*.
7. Test with several verified accounts (eligible elementary teacher, secondary VAPA teacher, reviewer, unauthorized district account, external account) and a safe non-student sample image. Test submit → private image → approve → publish → public feed → unpublish → removed from public sheet. Check data exposure, failure modes, and authorization errors.
8. After approval, configure production Sheet/folder using a documented deployment change. Set Staff Resources link to the new domain-restricted web app URL **only after** an authorized user confirms the real SSO and role checks. Until then, GitHub staff page remains a local-only demonstration.

## Important limitations

- Existing `doGet` public feed uses `getActiveSheet()`, which can accidentally expose staff-review tab data if reused; **do not** put a staff `doGet` in the existing public Apps Script project. In the public feed, later harden to `getSheetByName('Sheet1')` with published-only filtering and test it before changing production.
- Apps Script has execution, upload, and quota limits. This v1 accepts one image up to **8 MB per RPC**; the client loops across a batch. Bulk submissions should be tested for quotas. Very large deployments may benefit from Cloud Run or a managed storage service.
- Source includes no passwords, private keys, group addresses, or admin credentials.
- Submitted image blobs can still contain EXIF metadata; the district must establish an image-sanitization and retention process before deploying to students. Do not use personal/legal student names by default.
- A Sheets-backed queue is an interim architecture; Sheets and Drive updates are not one atomic transaction, so reconcile/monitor publication failures, especially if the app grows.
- The existing public feed schema has no publication flag for legacy rows. This design writes *only published* records into the public `Sheet1`, and writes all pending/approved states to `StaffSubmissions` exclusively.
- No changes have been made to the actual LVUSD Drive folder, Gallery spreadsheet, public script, or live GitHub site.

## Local validation

Run `node --check Code-copy.js` or copy the script to a `.js` file. Test backend logic with `node tests/security.spec.cjs` (mocks do not contact Google). The browser interface needs live Google Apps Script `google.script.run`, so static GitHub preview cannot fully test it.

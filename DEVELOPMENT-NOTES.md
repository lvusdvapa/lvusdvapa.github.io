# LVUSDVAPA development branch

This branch contains the **review-only** homepage and Visual Arts integration. The `main` branch is the published site and has not been changed by this integration.

- Homepage: original Orchestra Pathways and CHS Clue photos crossfade in the hero; compact Next on Stage strip.
- Visual Arts: Student Art Collection with School, Grade Created, School Year Created, Medium, Style, and Search filters; Agoura and Calabasas programs remain below.
- Gallery reads `https://script.google.com/macros/s/AKfycbx8dLGEv6CBGBQwm7PzpfTDmzn0rmLVtdvEqKhbjj9MxaMEJDIP3ZPQK46B9-1zp61n/exec` in read-only mode. The sheet is expected to contain only approved/published records. If unavailable, the page shows clearly labeled preview data. Display sample images remain hosted in Google Drive.
- Staff Resources opens `staff/art-gallery.html`, an **unsecured local demo** that saves only in the browser. There is NO real Google sign-in, secure uploads, reviewer authorization, backend, or production publishing. Do not enter sensitive student details in the prototype.

## Preview
GitHub Pages currently publishes `main`, so the `development` branch does not automatically have a hosted preview URL. To review, clone/download this branch and serve locally with `python3 -m http.server 8000`; open http://localhost:8000. Do not merge before visual and privacy review. A separate preview-host deployment can be added later.

## Production checklist
- Replace the demo with LVUSD Workspace authentication and a secure server-side submission/review backend.
- Ensure public feed contains published records only, including any school-year metadata; enforce privacy/consent and retention rules.
- Verify event feed, hero rotation, gallery filters, keyboard accessibility, and mobile layouts.
- Obtain approval before merging to `main`.

# D&H SAT Practice Website

This is a personal-use SAT practice website styled around D&H College branding. The logo file in `assets/dnh-logo.png` was downloaded from the public D&H College website asset URL:

`https://dnhcollege.com/wp-content/uploads/2024/01/logo1.png`

The app runs locally in your browser and stores users, uploaded SATs, answer keys, optional grading tables, attempts, and score history in browser storage.

## Quick Start

1. Open a terminal in this folder:
   `/Users/elvislu/Documents/Codex/2026-05-23/files-mentioned-by-the-user-25`
2. Start the local website:
   `python3 -m http.server 5173`
3. Open:
   `http://localhost:5173`
4. Log in as the first admin:
   - Username: `admin`
   - Password: `admin123`
   - Reset phrase: `dnh-reset`
5. Go to `Settings` and change the admin password.

## Share It On GitHub

This is a static website, so it can be shared with GitHub Pages.

1. Create a new GitHub repository.
2. Upload everything from this folder except any `.zip` file.
3. Commit the files.
4. In GitHub, open `Settings`.
5. Open `Pages`.
6. Under `Build and deployment`, choose:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
7. Save.
8. GitHub will give you a public website link after it finishes deploying.

Each friend who opens the site will have their own browser storage. Uploaded tests, accounts, and scores are not shared between different computers unless you export a backup from admin and they import it.

Important: this is designed for personal practice and friend sharing, not secure school-wide hosting. The login system runs in the browser, so do not use real private passwords.

## How To Upload A SAT

1. Log in as admin.
2. Open `Upload SAT`.
3. Enter a title, for example `December SAT Practice 2`.
4. Pick the date folder. This groups tests by upload date.
5. Upload the SAT question PDF.
6. Upload an answer sheet PDF, TXT, CSV, JSON, or paste the answer key.
7. Optional: upload a grading system CSV or JSON if you have an official raw-to-scale table for that SAT.
8. If the PDF is scanned or image-only, turn on `Use OCR for scanned/image PDFs`.
9. Click `Extract for review`.
10. Review each module:
   - Confirm every question is in the right module.
   - Confirm choices A, B, C, and D are separated correctly.
   - Confirm the correct answer is filled in.
   - Fix anything marked with low confidence.
11. Use `Auto-balance` if the PDF extracted one long list and you want the normal 27/27/22/22 split.
12. Click `Save test`.

## Templates Included

Use the files in the `templates` folder:

- `templates/answer-sheet-template.csv` - best answer key format for upload.
- `templates/answer-sheet-template.json` - JSON answer key option.
- `templates/answer-sheet-template.txt` - simple paste-ready answer key.
- `templates/grading-system-template.csv` - best grading table format.
- `templates/grading-system-template.json` - JSON grading table option.
- `templates/README-templates.md` - quick template guide.

## Answer Key Formats That Work Best

Plain text:

```text
RW1 1 A
RW1 2 C
RW2 1 B
Math 1 1 D
Math 2 1 A
```

CSV-style text also works:

```text
module,question,answer
RW1,1,A
RW1,2,C
MATH1,1,D
MATH1,2,3.5
```

If the answer sheet has only `1 A 2 C 3 D`, the app will still try to match answers, but module-specific answer keys are more accurate because SAT modules restart question numbers.

For math student-produced responses, type the exact value in the `answer` column. You can also use multiple accepted values separated by `|`, such as `3.5|7/2`.

## Grading System Format

Use this when you have an official raw-to-scale conversion table for the test:

```csv
section,raw,score
rw,0,200
rw,1,210
rw,54,800
math,0,200
math,1,210
math,44,800
```

Allowed sections are `rw` and `math`. If a grading table is uploaded, the score report uses it. If no grading table is uploaded, the app uses an estimated SAT-style 200-800 scale for each section.

## Student Flow

1. Students create an account or admin creates one.
2. Students choose a saved SAT from the dashboard.
3. The practice screen uses:
   - SAT-style top timer.
   - Text on the left.
   - Answer choices on the right.
   - Question navigation.
   - Flagged questions.
   - Highlight and underline tools.
   - Math formula sheet and scratch pad.
4. On submit, the attempt is saved into score history.

## Admin Score Tools

The admin can see:

- All student accounts.
- Attempts grouped by student.
- All scores in one sortable table.
- Best and latest scores.
- Tests grouped by date folder.

Admins can also reset a student password.

## Scoring Note

The real digital SAT uses College Board equating and adaptive module scoring. Those exact conversion tables are not included in normal PDFs, so no offline uploader can perfectly reproduce official scoring from answer letters alone.

This app scores in SAT format:

- Reading and Writing: 200 to 800.
- Math: 200 to 800.
- Total: 400 to 1600.

If you upload a grading system file, the app maps raw correct answers through that table. Without a grading table, it maps raw correct answers onto an estimated 200 to 800 section scale.

## Accuracy Tips For PDF Uploads

- Use text-based PDFs whenever possible.
- If a PDF is scanned images only, turn on OCR during upload. It is slower, but much better for image PDFs.
- Always review the extracted questions before saving.
- Put module labels in the PDF or answer key when possible, such as `Reading and Writing Module 1`.
- Use the PDF preview panel beside the editor to compare the extracted text with the original.

## Backups

Because the site stores data in the browser, export backups regularly:

1. Log in as admin.
2. Click `Export backup`.
3. Keep the JSON file somewhere safe.

To restore, use `Import backup` from the admin console.

## Files

- `index.html` - app shell.
- `styles.css` - layout and D&H-inspired visual styling.
- `app.js` - accounts, upload extraction, practice test, scoring, and admin logic.
- `assets/dnh-logo.png` - official logo image from the D&H College website.
- `templates/` - answer sheet and grading system templates.
- `vendor/` - local browser libraries for icons, PDF text extraction, and OCR.

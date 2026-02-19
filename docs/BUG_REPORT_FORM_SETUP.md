# Bug Report Google Form Setup

This doc covers how to set up the Google Form → GitHub Issues pipeline.

## 1. Create the Google Form

Create a new Google Form with these fields (in order):

| # | Field | Type | Required |
|---|-------|------|----------|
| 1 | What happened? | Long text | Yes |
| 2 | Steps to reproduce | Long text | Yes |
| 3 | Blueprint ID | Short text | No |
| 4 | Page URL where issue occurred | Short text | No |
| 5 | Browser | Dropdown: Chrome, Firefox, Safari, Edge, Other | Yes |
| 6 | Operating System | Dropdown: macOS, Windows, Linux, iOS, Android, Other | Yes |
| 7 | Console logs or error messages | Long text | No |
| 8 | Your email (for follow-up) | Short text | No |

Set the form title to "Weval Bug Report" (or "DTEF Bug Report" for the other repo).

## 2. Add the Apps Script

1. Open the form's linked Google Sheet (Responses tab → spreadsheet icon)
2. Go to **Extensions → Apps Script**
3. Replace the default code with the contents of the script below
4. Set script properties (gear icon → Project Settings → Script Properties):
   - `GITHUB_TOKEN` — a GitHub PAT with `repo` scope (use a bot account)
   - `GITHUB_REPO` — `weval-org/app` (or `collect-intel/dtef-app`)

## 3. Create Trigger

In Apps Script, go to **Triggers** (clock icon on left sidebar):
- Function: `onFormSubmit`
- Event source: From spreadsheet
- Event type: On form submit

## 4. Get the Pre-fill Link

In the Google Form editor:
1. Click the three-dot menu (top right) → **Get pre-filled link**
2. Fill in dummy values for "Page URL where issue occurred" and "Blueprint ID"
3. Copy the generated link — it will look like:
   `https://docs.google.com/forms/d/e/FORM_ID/viewform?usp=pp_url&entry.XXXXXXX=PAGE_URL&entry.YYYYYYY=BLUEPRINT_ID`
4. Note the `entry.XXXXXXX` and `entry.YYYYYYY` parameter names — you'll need these for the app's environment variables.

## 5. Set Environment Variables

Add to your `.env`:

```bash
NEXT_PUBLIC_BUG_REPORT_FORM_URL=https://docs.google.com/forms/d/e/FORM_ID/viewform
NEXT_PUBLIC_BUG_REPORT_FORM_PAGE_URL_ENTRY=entry.XXXXXXX
NEXT_PUBLIC_BUG_REPORT_FORM_BLUEPRINT_ENTRY=entry.YYYYYYY
```

---

## Apps Script Code

```javascript
function onFormSubmit(e) {
  var responses = e.namedValues;

  var description = (responses['What happened?'] || [''])[0];
  var steps = (responses['Steps to reproduce'] || [''])[0];
  var blueprintId = (responses['Blueprint ID'] || [''])[0];
  var pageUrl = (responses['Page URL where issue occurred'] || [''])[0];
  var browser = (responses['Browser'] || [''])[0];
  var os = (responses['Operating System'] || [''])[0];
  var logs = (responses['Console logs or error messages'] || [''])[0];
  var email = (responses['Your email (for follow-up)'] || [''])[0];

  var title = description.substring(0, 80);
  if (description.length > 80) title += '...';

  var body = '## Description\n\n' + description + '\n\n';
  body += '## Steps to Reproduce\n\n' + steps + '\n\n';

  if (blueprintId) body += '**Blueprint ID:** ' + blueprintId + '\n';
  if (pageUrl) body += '**Page URL:** ' + pageUrl + '\n';
  body += '**Browser:** ' + browser + '\n';
  body += '**OS:** ' + os + '\n';

  if (logs) body += '\n## Console Logs\n\n```\n' + logs + '\n```\n';
  if (email) body += '\n---\n*Submitted by: ' + email + '*\n';

  body += '\n---\n*Submitted via bug report form*';

  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('GITHUB_TOKEN');
  var repo = props.getProperty('GITHUB_REPO');

  var url = 'https://api.github.com/repos/' + repo + '/issues';

  var payload = {
    title: title,
    body: body,
    labels: ['bug', 'from-form']
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github.v3+json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();

  if (code !== 201) {
    Logger.log('GitHub API error (' + code + '): ' + response.getContentText());
  }
}
```

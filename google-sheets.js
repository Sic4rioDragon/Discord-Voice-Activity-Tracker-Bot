const { google } = require('googleapis');
const fs = require('fs');

const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

async function getClient() {
  return await auth.getClient();
}

async function getSheetsInstance() {
  const client = await getClient();
  return google.sheets({ version: 'v4', auth: client });
}

async function appendRow(sheetId, sheetName, row) {
  const sheets = await getSheetsInstance();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${sheetName}!A:F`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [row] }
  });
}

module.exports = { appendRow };

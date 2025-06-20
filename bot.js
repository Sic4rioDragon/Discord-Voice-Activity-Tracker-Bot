const { Client, GatewayIntentBits, AttachmentBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { createCanvas, loadImage } = require('canvas');
const { google } = require('googleapis');
const sharp = require('sharp');
const config = require('./config.json');
config.blacklist = config.blacklist || [];
config.snapshot_channel_id = config.snapshot_channel_id || null;


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

const activityFile = './activity.json';
const avatarCacheDir = './avatar_cache';
if (!fs.existsSync(avatarCacheDir)) fs.mkdirSync(avatarCacheDir);
if (!config.sheet_id) console.warn("[WARN] Missing 'sheet_id' in config.json.");
if (!config.guild_id) console.warn("[WARN] Missing 'guild_id' in config.json.");

let voiceTracker = {};
let activityData = fs.existsSync(activityFile) ? JSON.parse(fs.readFileSync(activityFile)) : {};

function saveActivity() {
  console.debug("[DEBUG] Saving activity data to disk.");
  fs.writeFileSync(activityFile, JSON.stringify(activityData, null, 2));
}

function getCurrentWeek() {
  const now = new Date();
  const year = now.getFullYear();
  const week = Math.ceil((((now - new Date(year, 0, 1)) / 86400000) + new Date(year, 0, 1).getDay() + 1) / 7);
  return `${year}-W${week}`;
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMinutes(mins) {
  mins = Math.max(0, mins);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

async function getSheets() {
  console.debug("[DEBUG] Initializing Google Sheets API");
  const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

async function updateSheet(userId, displayName, lifetime, weekly, monthly) {
  console.debug(`[DEBUG] Updating sheet for ${displayName} (${userId})`);
  const sheets = await getSheets();
  const sheet = config.sheet_id;
  const tabName = "TAW DayZ";

  const expectedHeader = [
    "Discord User ID",
    "Display Name",
    "Lifetime (min)",
    "Lifetime (formatted)",
    "This Week (min)",
    "This Week (formatted)",
    "This Month (min)",
    "This Month (formatted)",
    "Last Updated"
  ];

  const headerCheck = await sheets.spreadsheets.values.get({
    spreadsheetId: sheet,
    range: `${tabName}!A1:I1`
  });

  const headersExist = headerCheck.data.values?.[0]?.join() === expectedHeader.join();
  if (!headersExist) {
    console.debug("[DEBUG] Header mismatch - updating header row.");
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheet,
      range: `${tabName}!A1:I1`,
      valueInputOption: 'RAW',
      resource: { values: [expectedHeader] }
    });
  }

  const getRes = await sheets.spreadsheets.values.get({
    spreadsheetId: sheet,
    range: `${tabName}!A2:I`
  });

  const values = getRes.data.values || [];
  const rowIndex = values.findIndex(row => row[0]?.toString().replace(/^'/, '') === userId.toString());

  const rowData = [
    userId,
    displayName,
    lifetime.toString(),
    formatMinutes(lifetime),
    weekly.toString(),
    formatMinutes(weekly),
    monthly.toString(),
    formatMinutes(monthly),
    new Date().toISOString()
  ];

  if (rowIndex >= 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheet,
      range: `${tabName}!A${rowIndex + 2}:I${rowIndex + 2}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [rowData] }
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheet,
      range: `${tabName}!A:I`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [rowData] }
    });
  }
  console.debug(`[DEBUG] Sheet updated for ${displayName}`);
}

function downloadImage(url, filePath) {
  console.debug(`[DEBUG] Downloading image from ${url}`);
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        sharp(buffer).png().toFile(filePath).then(resolve).catch(reject);
      });
    }).on('error', reject);
  });
}

async function generateSnapshotImage(channel) {
  console.debug(`[DEBUG] Generating snapshot for channel ${channel.name}`);
  const members = Array.from(channel.members.values()).filter(m => !m.user.bot);
  const canvas = createCanvas(600, members.length * 80 + 50);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1e1e2f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '20px Sans';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Voice Channel: ${channel.name}`, 20, 30);

  let y = 60;
  for (const member of members) {
    const avatarURL = member.displayAvatarURL({ format: 'png', size: 128 });
    const avatarPath = path.join(avatarCacheDir, `${member.id}.png`);

    try {
      if (!fs.existsSync(avatarPath)) {
        await downloadImage(avatarURL, avatarPath);
      }
      const avatar = await loadImage(avatarPath);
      ctx.drawImage(avatar, 20, y, 50, 50);
    } catch (err) {
      console.warn(`[WARN] Failed to load avatar for ${member.displayName}: ${err.message}`);
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillText(member.displayName, 80, y + 30);
    y += 80;
  }

  return canvas.toBuffer('image/png');
}

async function sendVCSnapshots(guild) {
  console.debug("[DEBUG] Sending VC snapshots...");

  
  if (!config.snapshot_channel_id) {
    console.debug("[DEBUG] Snapshot channel not configured. Skipping.");
    return;
  }

  let logChannel;
  try {
    logChannel = await client.channels.fetch(config.snapshot_channel_id);
  } catch (err) {
    console.warn(`[WARN] Could not fetch snapshot channel: ${err.message}`);
    return;
  }

  const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());

  for (const [, vc] of voiceChannels) {
    const members = Array.from(vc.members.values()).filter(m => !m.user.bot);
    if (members.length >= 3) {
      try {
        const buffer = await generateSnapshotImage(vc);
        const attachment = new AttachmentBuilder(buffer, { name: `vc_snapshot_${vc.id}.png` });
        const unixTimestamp = Math.floor(Date.now() / 1000);
        const timestamp = `<t:${unixTimestamp}:F>`;
        await logChannel.send({
          content: `Auto Adhoc of **${vc.name}** with ${members.length} members at ${timestamp}`,
          files: [attachment]
        });
      } catch (e) {
        console.warn(`[WARN] Failed to send snapshot for ${vc.name}: ${e.message}`);
      }
    }
  }

  console.debug("[DEBUG] VC snapshots completed.");
}

client.on('voiceStateUpdate', async (oldState, newState) => {
  const userId = newState.id;
  const member = newState.member || oldState.member;
  const oldChannel = oldState.channelId;
  const newChannel = newState.channelId;
  const displayName = member?.displayName || "Unknown";

  const now = Date.now();
  const month = getCurrentMonth();
  const week = getCurrentWeek();

  if (!activityData[userId]) {
    activityData[userId] = { lifetime: 0, monthly: {}, weekly: {} };
  }

  if (voiceTracker[userId] && newChannel && config.blacklist.includes(newChannel)) {
    const joinedAt = voiceTracker[userId].joinedAt;
    const durationMin = Math.round((now - joinedAt) / 60000);
    const effectiveMin = durationMin - 30;
    if (activityData[userId].lifetime >= 30) {
      activityData[userId].lifetime = Math.max(0, activityData[userId].lifetime + effectiveMin);
      activityData[userId].monthly[month] = Math.max(0, (activityData[userId].monthly[month] || 0) + effectiveMin);
      activityData[userId].weekly[week] = Math.max(0, (activityData[userId].weekly[week] || 0) + effectiveMin);
      saveActivity();
      console.log(`[DEBUG] Applied 30m penalty to ${displayName} after move to blacklisted VC`);
      await updateSheet(userId, displayName, activityData[userId].lifetime, activityData[userId].weekly[week], activityData[userId].monthly[month]);
    } else {
      console.log(`[DEBUG] Skipped penalty for ${displayName} (not enough time on record)`);
    }
    delete voiceTracker[userId];
    return;
  }

  if (!voiceTracker[userId] && newChannel && !config.blacklist.includes(newChannel)) {
    voiceTracker[userId] = { joinedAt: now, inVC: true };
    console.log(`[DEBUG] ${displayName} joined VC`);
} else if (voiceTracker[userId] && !newChannel) {
  const joinedAt = voiceTracker[userId].joinedAt;
  const durationMin = Math.round((now - joinedAt) / 60000);
  if (durationMin < 1) {
    console.log(`[DEBUG] Ignored ${displayName} (less than 1 minute)`);
    delete voiceTracker[userId];
    return;
  }
    if (!activityData[userId].monthly) activityData[userId].monthly = {};
if (!activityData[userId].weekly) activityData[userId].weekly = {};

activityData[userId].lifetime += durationMin;
activityData[userId].monthly[month] = (activityData[userId].monthly[month] || 0) + durationMin;
activityData[userId].weekly[week] = (activityData[userId].weekly[week] || 0) + durationMin;

    saveActivity();
    console.log(`[DEBUG] ${displayName} left VC after ${durationMin}m`);
    await updateSheet(userId, displayName, activityData[userId].lifetime, activityData[userId].weekly[week], activityData[userId].monthly[month]);
    delete voiceTracker[userId];
  }
});

client.once('ready', async () => {
  console.log(`✅ Bot ready as ${client.user.tag}`);
  const guild = await client.guilds.fetch(config.guild_id);
  const members = await guild.members.fetch();

  members.forEach(member => {
    const vc = member.voice.channel;
    if (vc && !config.blacklist.includes(vc.id)) {
      voiceTracker[member.id] = { joinedAt: Date.now(), inVC: true };
      console.log(`[DEBUG] Tracking active VC user on startup: ${member.displayName} in ${vc.name}`);
    }
  });

try {
  await sendVCSnapshots(guild);
} catch (e) {
  console.warn(`[WARN] Snapshot failed on startup: ${e.message}`);
}


  let lastTick = Date.now();

  setInterval(async () => {
    const now = Date.now();
    const elapsedMin = Math.floor((now - lastTick) / 60000);
    if (elapsedMin < 1) return;
    if (elapsedMin > 1) console.warn(`[WARN] Bot delayed, ${elapsedMin} minutes passed since last tick`);

    lastTick = now;

    for (const userId in voiceTracker) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;
      const displayName = member.displayName;
      const month = getCurrentMonth();
      const week = getCurrentWeek();

      if (!activityData[userId]) {
        activityData[userId] = { lifetime: 0, monthly: {}, weekly: {} };
      }

      if (!activityData[userId].monthly) activityData[userId].monthly = {};
if (!activityData[userId].weekly) activityData[userId].weekly = {};

activityData[userId].lifetime += elapsedMin;
activityData[userId].monthly[month] = (activityData[userId].monthly[month] || 0) + elapsedMin;
activityData[userId].weekly[week] = (activityData[userId].weekly[week] || 0) + elapsedMin;


      saveActivity();
      await updateSheet(userId, displayName, activityData[userId].lifetime, activityData[userId].weekly[week], activityData[userId].monthly[month]);
    }
  }, 60000);


  setInterval(() => sendVCSnapshots(guild), 60 * 60 * 1000);
});


client.login(config.token);

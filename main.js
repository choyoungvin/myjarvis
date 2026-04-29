const { app, BrowserWindow, ipcMain, session } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Config file path (stores Notion token etc.)
const CONFIG_PATH = path.join(app.getPath('userData'), 'jarvis-config.json');

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {}
    return { 
        notionToken: '', 
        notionDbId: '',
        groqApiKey: '' 
    };
}

function saveConfig(data) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

function createWindow() {
    app.setName('JARVIS');
    if (process.platform === 'darwin') {
        app.dock.setIcon(path.join(__dirname, 'app/assets/icon.png'));
    }
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "JARVIS",
        icon: path.join(__dirname, 'app/assets/icon.png'),
        minWidth: 1100,
        minHeight: 700,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#020c12',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            spellcheck: true,
        },
    });

    // Spoof User-Agent to look like official Chrome to avoid 'network' error in Web Speech API
    const chromeUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    win.webContents.setUserAgent(chromeUA);

    win.loadFile('app/index.html');

    // Allow microphone & camera permissions inside Electron window
    win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        if (['media', 'microphone', 'camera', 'audioCapture'].includes(permission)) {
            callback(true);
        } else {
            callback(false);
        }
    });
    win.webContents.session.setPermissionCheckHandler((webContents, permission) => {
        if (['media', 'microphone', 'audioCapture'].includes(permission)) return true;
        return false;
    });

    // Window controls via IPC
    ipcMain.on('window-minimize', () => win.minimize());
    ipcMain.on('window-close',    () => win.close());
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── AppleScript Helper ───────────────────────────────────────
function runAppleScript(script) {
    return new Promise((resolve, reject) => {
        exec(`osascript -e '${script.replace(/'/g, "\\'")}'`, (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout.trim());
        });
    });
}

// ── JXA Scripts (inlined to avoid ASAR path issues) ─────────
const JXA_CALENDAR = `
ObjC.import('EventKit');
var store = $.EKEventStore.alloc.init;
var done = false;
var result = [];
store.requestAccessToEntityTypeCompletion(0, function(granted, error) {
    if (granted) {
        var calendars = store.calendarsForEntityType(0);
        var cal = $.NSCalendar.currentCalendar;
        var startOfDay = cal.startOfDayForDate($.NSDate.date);
        var comps = $.NSDateComponents.alloc.init;
        comps.day = 1;
        var endOfDay = cal.dateByAddingComponentsToDateOptions(comps, startOfDay, 0);
        var predicate = store.predicateForEventsWithStartDateEndDateCalendars(startOfDay, endOfDay, calendars);
        var events = store.eventsMatchingPredicate(predicate);
        var f = $.NSDateFormatter.alloc.init;
        f.dateFormat = 'HH:mm';
        for (var i = 0; i < events.count; i++) {
            var e = events.objectAtIndex(i);
            result.push({ title: e.title.js || '', start: f.stringFromDate(e.startDate).js || '', end: f.stringFromDate(e.endDate).js || '' });
        }
    }
    done = true;
});
while(!done) { $.NSRunLoop.currentRunLoop.runModeBeforeDate($.NSDefaultRunLoopMode, $.NSDate.dateWithTimeIntervalSinceNow(0.1)); }
JSON.stringify(result);
`;

const SWIFT_REMINDERS = `
import EventKit
import Foundation

let store = EKEventStore()
let sema = DispatchSemaphore(value: 0)
var result = [[String: String]]()

func fetch() {
    let predicate = store.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: nil)
    store.fetchReminders(matching: predicate) { reminders in
        for r in reminders ?? [] {
            result.append(["name": r.title ?? "", "due": "none"])
        }
        sema.signal()
    }
}

if #available(macOS 14.0, *) {
    store.requestFullAccessToReminders { (granted, error) in
        if granted { fetch() } else { sema.signal() }
    }
} else {
    store.requestAccess(to: .reminder) { (granted, error) in
        if granted { fetch() } else { sema.signal() }
    }
}
sema.wait()

if let data = try? JSONSerialization.data(withJSONObject: result),
   let json = String(data: data, encoding: .utf8) {
    print(json)
}
`;

function runJXA(script) {
    return new Promise((resolve) => {
        const tmpFile = path.join('/tmp', `jarvis_jxa_${Date.now()}.js`);
        try { fs.writeFileSync(tmpFile, script, 'utf8'); } catch(e) { resolve([]); return; }
        exec(`osascript -l JavaScript "${tmpFile}"`, (err, stdout, stderr) => {
            try { fs.unlinkSync(tmpFile); } catch(_) {}
            const raw = (stdout || '').trim();
            if (!raw) { resolve([]); return; }
            try { resolve(JSON.parse(raw)); }
            catch { resolve([]); }
        });
    });
}

function runSwift(script) {
    return new Promise((resolve) => {
        const tmpFile = path.join('/tmp', `jarvis_swift_${Date.now()}.swift`);
        try { fs.writeFileSync(tmpFile, script, 'utf8'); } catch(e) { resolve([]); return; }
        exec(`swift "${tmpFile}"`, (err, stdout, stderr) => {
            try { fs.unlinkSync(tmpFile); } catch(_) {}
            const raw = (stdout || '').trim();
            if (!raw) { resolve([]); return; }
            try { resolve(JSON.parse(raw)); }
            catch { resolve([]); }
        });
    });
}

// ── IPC: macOS Integration ────────────────────────────────────
ipcMain.handle('get-calendar-events', () => runJXA(JXA_CALENDAR));
ipcMain.handle('get-reminders',       () => runSwift(SWIFT_REMINDERS));

// ── IPC: Groq LLM (Brain) ────────────────────────────────────
ipcMain.handle('ask-llm', async (_, { text, context }) => {
    const config = loadConfig();
    if (!config.groqApiKey) return { error: 'GROQ_API_KEY_MISSING' };

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${config.groqApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: `당신은 J.A.R.V.I.S, 조영빈 님의 학업을 돕는 인공지능 비서입니다. 아이언맨의 자비스처럼 정중하고 유능한 톤으로 짧게 대답하세요. 다음은 현재 사용자의 상태 데이터입니다:\n${context}` },
                    { role: 'user', content: text }
                ],
                temperature: 0.5,
                max_tokens: 150
            }),
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return { reply: data.choices[0].message.content };
    } catch (e) {
        console.error('Groq LLM Error:', e);
        return { error: e.message };
    }
});

// Notion IPC handler removed. Assignments will be handled locally.

// ── IPC: Groq Whisper (Speech-to-Text) ────────────────────────
ipcMain.handle('transcribe-audio', async (_, audioBuffer) => {
    const config = loadConfig();
    if (!config.groqApiKey) return { error: 'GROQ_API_KEY_MISSING' };

    try {
        // Create form data for Groq API
        const formData = new FormData();
        const blob = new Blob([audioBuffer], { type: 'audio/webm' });
        formData.append('file', blob, 'audio.webm');
        formData.append('model', 'whisper-large-v3');
        formData.append('language', 'ko');
        formData.append('response_format', 'json');

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${config.groqApiKey}` },
            body: formData,
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return { text: data.text };
    } catch (e) {
        console.error('Groq Transcription Error:', e);
        return { error: e.message };
    }
});

// ── IPC: Config ───────────────────────────────────────────────
ipcMain.handle('get-config', () => loadConfig());
ipcMain.handle('save-config', (_, data) => { saveConfig(data); return true; });

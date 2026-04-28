const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Config file path (stores Notion token etc.)
const CONFIG_PATH = path.join(app.getPath('userData'), 'jarvis-config.json');

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {}
    return { notionToken: '', notionDbId: '' };
}

function saveConfig(data) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

// ── Create Window ────────────────────────────────────────────
function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 780,
        minWidth: 1100,
        minHeight: 700,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#020c12',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    win.loadFile('app/index.html');

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

// ── IPC: macOS Calendar ──────────────────────────────────────
ipcMain.handle('get-calendar-events', async () => {
    const script = `
        set output to {}
        set todayStart to current date
        set time of todayStart to 0
        set todayEnd to todayStart + (1 * days)
        tell application "Calendar"
            repeat with aCal in every calendar
                set calEvents to every event of aCal whose start date >= todayStart and start date < todayEnd
                repeat with e in calEvents
                    set evtTitle to summary of e
                    set evtStart to start date of e
                    set evtEnd to end date of e
                    set end of output to (evtTitle & "|" & evtStart & "|" & evtEnd)
                end repeat
            end repeat
        end tell
        return output
    `;
    try {
        const raw = await runAppleScript(script);
        if (!raw || raw === '{}') return [];
        return raw.split(', ').map(item => {
            const parts = item.split('|');
            return { title: parts[0] || '', start: parts[1] || '', end: parts[2] || '' };
        });
    } catch (e) {
        console.error('Calendar error:', e.message);
        return { error: '캘린더 접근 실패. 시스템 환경설정 > 개인 정보 보호 > 캘린더에서 앱을 허용해주세요.' };
    }
});

// ── IPC: macOS Reminders ─────────────────────────────────────
ipcMain.handle('get-reminders', async () => {
    const script = `
        set output to {}
        tell application "Reminders"
            set incompleteItems to every reminder whose completed is false
            repeat with r in incompleteItems
                set rName to name of r
                try
                    set rDue to due date of r
                    set end of output to (rName & "|" & rDue)
                on error
                    set end of output to (rName & "|none")
                end try
            end repeat
        end tell
        return output
    `;
    try {
        const raw = await runAppleScript(script);
        if (!raw || raw === '{}') return [];
        return raw.split(', ').map(item => {
            const parts = item.split('|');
            return { name: parts[0] || '', due: parts[1] !== 'none' ? parts[1] : null };
        });
    } catch (e) {
        console.error('Reminders error:', e.message);
        return { error: '미리알림 접근 실패. 시스템 환경설정 > 개인 정보 보호 > 미리알림에서 앱을 허용해주세요.' };
    }
});

// ── IPC: Notion ───────────────────────────────────────────────
ipcMain.handle('get-notion-tasks', async () => {
    const config = loadConfig();
    if (!config.notionToken || !config.notionDbId) {
        return { error: 'NOTION_NOT_CONFIGURED' };
    }

    try {
        const response = await fetch(`https://api.notion.com/v1/databases/${config.notionDbId}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.notionToken}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                filter: { property: 'Status', status: { does_not_equal: '완료' } },
                sorts: [{ property: 'Due Date', direction: 'ascending' }],
            }),
        });
        const data = await response.json();
        if (!data.results) return { error: data.message || 'Notion API 오류' };

        return data.results.map(page => {
            const props = page.properties;
            const title = props.Name?.title?.[0]?.plain_text || props.제목?.title?.[0]?.plain_text || '제목 없음';
            const due   = props['Due Date']?.date?.start || props['마감일']?.date?.start || null;
            const status = props.Status?.status?.name || props['상태']?.select?.name || '진행중';
            return { title, due, status, url: page.url };
        });
    } catch (e) {
        return { error: `Notion 연결 실패: ${e.message}` };
    }
});

// ── IPC: Config ───────────────────────────────────────────────
ipcMain.handle('get-config', () => loadConfig());
ipcMain.handle('save-config', (_, data) => { saveConfig(data); return true; });

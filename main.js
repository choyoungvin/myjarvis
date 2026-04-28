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

// ── IPC: macOS Integration (via Swift EventKit) ────────────────
ipcMain.handle('get-calendar-events', async () => {
    return new Promise((resolve) => {
        exec(`swift "${path.join(__dirname, 'mac-data.swift')}" calendar`, (err, stdout) => {
            if (err || !stdout.trim()) resolve([]);
            else {
                try { resolve(JSON.parse(stdout.trim())); }
                catch { resolve([]); }
            }
        });
    });
});

ipcMain.handle('get-reminders', async () => {
    return new Promise((resolve) => {
        exec(`swift "${path.join(__dirname, 'mac-data.swift')}" reminders`, (err, stdout) => {
            if (err || !stdout.trim()) resolve([]);
            else {
                try { resolve(JSON.parse(stdout.trim())); }
                catch { resolve([]); }
            }
        });
    });
});

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
                model: 'llama3-70b-8192',
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

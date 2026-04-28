// J.A.R.V.I.S Academic Secretary — app.js

// ── DATA ────────────────────────────────────────────────────
let SCHEDULE = [];
let ASSIGNMENTS = [];
let REMINDERS = [];

// ── DOM ──────────────────────────────────────────────────────
const voiceBtn          = document.getElementById('voiceBtn');
const voiceBtnLabel     = document.getElementById('voiceBtnLabel');
const micDot            = document.getElementById('micDot');
const micStatusText     = document.getElementById('micStatusText');
const consoleOutput     = document.getElementById('consoleOutput');
const transcriptBox     = document.getElementById('transcriptBox');
const arcCore           = document.getElementById('arcCore');
const canvas            = document.getElementById('waveCanvas');
const ctx               = canvas.getContext('2d');
const scheduleList      = document.getElementById('scheduleList');
const todoList          = document.getElementById('todoList');
const assignmentList    = document.getElementById('assignmentList');
const todoInput         = document.getElementById('todoInput');
const todoAddBtn        = document.getElementById('todoAddBtn');
const audioStatusEl     = document.getElementById('audioStatus');
const recogStatusEl     = document.getElementById('recognitionStatus');
const weatherStatusEl   = document.getElementById('weatherStatus');
const taskCountEl       = document.getElementById('taskCount');
const headerDateEl      = document.getElementById('headerDate');
const todayLabelEl      = document.getElementById('todayLabel');

// ── STATE ────────────────────────────────────────────────────
let audioCtx, analyser, micSource, animFrameId;
let mediaRecorder, audioChunks = [], isListening = false;
let silenceTimer = null, lastAudioTime = Date.now(), hasSpoken = false;
let weatherCache = null;

// ── UTILS ────────────────────────────────────────────────────
const DAYS_KO = ['일','월','화','수','목','금','토'];
const DAYS_EN = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

function calcDday(dateStr) {
    const due   = new Date(dateStr); due.setHours(0,0,0,0);
    const today = new Date();        today.setHours(0,0,0,0);
    return Math.ceil((due - today) / 86400000);
}

function ddayClass(d) {
    if (d <= 3)  return 'urgent';
    if (d <= 7)  return 'warning';
    return 'normal';
}

function timeToMins(t) { const [h,m]=t.split(':'); return +h*60+ +m; }

function match(cmd, kws) { return kws.some(k => cmd.includes(k)); }
function pick(arr)        { return arr[Math.floor(Math.random()*arr.length)]; }

// ── CLOCK & DATE ─────────────────────────────────────────────
function updateClock() {
    const now = new Date();
    const dayStr = `${DAYS_EN[now.getDay()]} ${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
    headerDateEl.textContent = dayStr;
    todayLabelEl.textContent = `${DAYS_KO[now.getDay()]}요일`;
}
setInterval(updateClock, 1000);
updateClock();

// ── SCHEDULE RENDER ──────────────────────────────────────────
function renderSchedule() {
    const now   = new Date();
    const nowM  = now.getHours()*60 + now.getMinutes();

    if (!SCHEDULE.length) {
        scheduleList.innerHTML = '<div class="no-class">📚 오늘은 일정이 없습니다</div>';
        return;
    }

    scheduleList.innerHTML = SCHEDULE.map(s => {
        const startM = timeToMins(s.start || '00:00'), endM = timeToMins(s.end || '23:59');
        const cls = nowM >= startM && nowM < endM ? 'current' : nowM >= endM ? 'done' : '';
        return `<div class="schedule-item ${cls}">
            <div class="sch-time">${s.start} – ${s.end}</div>
            <div class="sch-subject">${s.title}</div>
        </div>`;
    }).join('');
}

// ── ASSIGNMENT RENDER ────────────────────────────────────────
function renderAssignments() {
    if (!ASSIGNMENTS.length) {
        assignmentList.innerHTML = '<div class="empty-msg">진행 중인 과제가 없습니다</div>';
        taskCountEl.textContent = '0 pending';
        return;
    }

    const sorted = [...ASSIGNMENTS].sort((a,b) => calcDday(a.dueDate) - calcDday(b.dueDate));
    assignmentList.innerHTML = sorted.map(a => {
        const d   = calcDday(a.dueDate);
        const cls = ddayClass(d);
        const label = d === 0 ? 'D-DAY' : d < 0 ? '완료' : `D-${d}`;
        return `<div class="assign-item ${cls}">
            <div class="assign-info">
                <div class="assign-subject">NOTION</div>
                <div class="assign-title">${a.title}</div>
                <div class="assign-due">마감: ${a.dueDate}</div>
            </div>
            <div class="dday-badge ${cls}">${label}</div>
        </div>`;
    }).join('');

    const pending = sorted.filter(a => calcDday(a.dueDate) >= 0).length;
    taskCountEl.textContent = `${pending} pending`;
}

// ── TODO (Reminders) ─────────────────────────────────────────
function renderTodos() {
    if (!REMINDERS.length) { 
        todoList.innerHTML = '<div class="empty-msg">미리알림이 없습니다</div>'; 
        return; 
    }
    todoList.innerHTML = REMINDERS.map(t => `
        <div class="todo-item" style="padding-left:10px;">
            <span style="color:#00e5ff;">■</span>
            <span class="todo-text">${t.name}</span>
            ${t.due && t.due !== 'none' ? `<span style="font-size:0.7em; color:#888;">(${t.due})</span>` : ''}
        </div>`).join('');
}

todoAddBtn.style.display = 'none';
todoInput.placeholder = '미리알림 연동 완료 (읽기 전용)';
todoInput.disabled = true;

// ── WEATHER ──────────────────────────────────────────────────
async function fetchWeather() {
    try {
        const r    = await fetch('https://wttr.in/Seoul?format=j1', { signal: AbortSignal.timeout(6000) });
        const data = await r.json();
        const temp = data.current_condition[0].temp_C;
        const desc = data.current_condition[0].lang_ko?.[0]?.value || data.current_condition[0].weatherDesc[0].value;
        weatherCache = { temp, desc };
        weatherStatusEl.textContent = `${temp}°C ${desc}`;
        return weatherCache;
    } catch {
        weatherStatusEl.textContent = '정보 없음';
        return null;
    }
}

// ── CONSOLE LOG ──────────────────────────────────────────────
function log(text, type='sys') {
    const el = document.createElement('div');
    el.className = `log-line ${type}`;
    el.textContent = (type==='jarvis'?'▸ JARVIS: ':type==='user'?'▸ YOU: ':type==='error'?'✖ ERR: ':'◈ ') + text;
    consoleOutput.appendChild(el);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function jarvisSpeak(text) {
    const el = document.createElement('div');
    el.className = 'log-line jarvis';
    el.textContent = '▸ JARVIS: ';
    consoleOutput.appendChild(el);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
    let i=0;
    const iv = setInterval(()=>{ el.textContent+=text[i++]; consoleOutput.scrollTop=consoleOutput.scrollHeight; if(i>=text.length) clearInterval(iv); }, 25);
}

// ── BRIEFING ─────────────────────────────────────────────────
async function doBriefing() {
    const now  = new Date();
    const h    = now.getHours(), m = now.getMinutes();
    const ampm = h<12?'오전':'오후';
    const h12  = h%12||12;
    const dow  = DAYS_KO[now.getDay()];

    jarvisSpeak(`안녕하세요. 오늘은 ${now.getMonth()+1}월 ${now.getDate()}일 ${dow}요일이며, 현재 시각은 ${ampm} ${h12}시 ${m}분입니다.`);

    const w = weatherCache || await fetchWeather();
    setTimeout(()=>{
        if(w) jarvisSpeak(`현재 서울 날씨는 ${w.desc}, 기온 ${w.temp}°C입니다.`);

        setTimeout(()=>{
            const items = SCHEDULE.filter(s=>s.days.includes(now.getDay()))
                                  .sort((a,b)=>timeToMins(a.start)-timeToMins(b.start));
            if(items.length) {
                jarvisSpeak(`오늘 수업은 총 ${items.length}개입니다. 첫 수업은 ${items[0].start} ${items[0].subject}입니다.`);
            } else {
                jarvisSpeak('오늘은 수업이 없습니다. 과제에 집중하기 좋은 날이네요.');
            }

            setTimeout(()=>{
                const urgent = ASSIGNMENTS.filter(a=>calcDday(a.dueDate)<=3 && calcDday(a.dueDate)>=0);
                if(urgent.length) {
                    jarvisSpeak(`⚠ 마감이 3일 이내인 과제가 ${urgent.length}개 있습니다: ${urgent.map(a=>a.title).join(', ')}.`);
                } else {
                    const next = [...ASSIGNMENTS].sort((a,b)=>calcDday(a.dueDate)-calcDday(b.dueDate))[0];
                    if(next) jarvisSpeak(`다음 과제 마감은 D-${calcDday(next.dueDate)}, "${next.title}"입니다.`);
                }
            }, 1800);
        }, 1500);
    }, 800);
}

// ── COMMAND HANDLER (LLM Brain) ───────────────────────────────
async function handleCommand(raw) {
    const text = raw.trim();
    if (!text) return;
    
    recogStatusEl.textContent = 'THINKING...';
    
    // Construct context for the LLM
    const context = `
    현재 시간: ${new Date().toLocaleString('ko-KR')}
    오늘 일정(Calendar): ${SCHEDULE.map(s => s.start + ' ' + s.title).join(', ') || '일정 없음'}
    할 일(Reminders): ${REMINDERS.map(r => r.name).join(', ') || '할 일 없음'}
    과제(Notion): ${ASSIGNMENTS.map(a => a.title + ' (마감: ' + a.dueDate + ')').join(', ') || '과제 없음'}
    날씨: ${weatherCache ? weatherCache.desc + ', ' + weatherCache.temp + '도' : '정보 없음'}
    `;

    const result = await window.jarvis.askLlm({ text, context });
    
    recogStatusEl.textContent = 'LISTENING';
    
    if (result.reply) {
        jarvisSpeak(result.reply);
    } else {
        jarvisSpeak("네트워크 오류로 두뇌 서버에 연결할 수 없습니다.");
        log(result.error, 'error');
    }
}

// ── CANVAS VISUALIZER ────────────────────────────────────────
function resizeCanvas() { const w=canvas.parentElement; canvas.width=w.offsetWidth; canvas.height=w.offsetHeight; }
resizeCanvas(); window.addEventListener('resize', resizeCanvas);

function drawWave() {
    const W=canvas.width, H=canvas.height, cx=W/2, cy=H/2;
    const baseR = Math.min(W,H)/2*0.36;
    ctx.clearRect(0,0,W,H);

    if (!analyser||!isListening) { drawIdleRing(cx,cy,baseR); return; }

    const buf=new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(buf);
    let sum=0; for(let i=0;i<buf.length;i++) sum+=buf[i];
    const avg=sum/buf.length;

    arcCore.style.transform=`scale(${1+avg/130})`;
    arcCore.style.boxShadow=`0 0 ${20+avg*0.8}px rgba(0,229,255,${0.4+avg/220})`;

    [0,1,2].forEach(r=>{
        const rr=baseR+r*20, alpha=1-r*.28, pts=120, step=Math.floor(buf.length/pts);
        ctx.beginPath();
        for(let i=0;i<pts;i++){
            const amp=(buf[i*step]||0)/255*(18+r*7);
            const angle=i/pts*Math.PI*2-Math.PI/2;
            const x=cx+Math.cos(angle)*(rr+amp), y=cy+Math.sin(angle)*(rr+amp);
            i?ctx.lineTo(x,y):ctx.moveTo(x,y);
        }
        ctx.closePath();
        ctx.strokeStyle=`rgba(0,229,255,${alpha*.85})`; ctx.lineWidth=1.5-r*.3;
        ctx.shadowBlur=10; ctx.shadowColor='rgba(0,229,255,.5)'; ctx.stroke(); ctx.shadowBlur=0;
    });
}

function drawIdleRing(cx,cy,r) {
    const t=Date.now()/1000, amp=4*Math.sin(t*1.5)+4;
    ctx.beginPath();
    for(let i=0;i<=128;i++){
        const a=i/128*Math.PI*2-Math.PI/2, w=amp*Math.sin(a*6+t*2);
        const x=cx+Math.cos(a)*(r+w), y=cy+Math.sin(a)*(r+w);
        i?ctx.lineTo(x,y):ctx.moveTo(x,y);
    }
    ctx.closePath();
    ctx.strokeStyle='rgba(0,229,255,.3)'; ctx.lineWidth=1.2;
    ctx.shadowBlur=8; ctx.shadowColor='rgba(0,229,255,.4)'; ctx.stroke(); ctx.shadowBlur=0;
    arcCore.style.transform='scale(1)'; arcCore.style.boxShadow='';
}

function renderLoop() { drawWave(); animFrameId=requestAnimationFrame(renderLoop); }
renderLoop();

// ── AUDIO ────────────────────────────────────────────────────
async function startAudio() {
    try {
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        audioCtx=new (window.AudioContext||window.webkitAudioContext)();
        analyser=audioCtx.createAnalyser(); analyser.fftSize=512; analyser.smoothingTimeConstant=0.8;
        micSource=audioCtx.createMediaStreamSource(stream); micSource.connect(analyser);
        audioStatusEl.textContent='ACTIVE'; log('Microphone stream active.','sys');
    } catch { log('Microphone access denied.','error'); audioStatusEl.textContent='DENIED'; }
}

function stopAudio() { if(audioCtx){audioCtx.close();audioCtx=analyser=micSource=null;} audioStatusEl.textContent='STANDBY'; }

// ── VOICE LINK (Groq Whisper Integration) ─────────────────────
async function startVoiceLink() {
    if (isListening) return;
    isListening = true;
    voiceBtn.classList.add('listening'); voiceBtnLabel.textContent = 'TERMINATE VOICE LINK';
    micDot.classList.add('active'); micStatusText.textContent = 'VOICE LINK ONLINE';
    
    await startAudio();
    startMediaRecorder();
    jarvisSpeak('AI 음성 엔진(Groq Whisper)이 활성화되었습니다. 말씀해 보세요.');
}

function stopVoiceLink() {
    isListening = false;
    voiceBtn.classList.remove('listening'); voiceBtnLabel.textContent = 'ACTIVATE VOICE LINK';
    micDot.classList.remove('active'); micStatusText.textContent = 'VOICE LINK OFFLINE';
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    stopAudio(); 
    recogStatusEl.textContent = 'IDLE';
    transcriptBox.innerHTML = '<span class="transcript-placeholder">"안녕 자비스" 라고 말해보세요</span>';
    arcCore.style.transform = 'scale(1)'; arcCore.style.boxShadow = '';
    log('Voice link terminated.', 'sys');
}

function startMediaRecorder() {
    if (!micSource) return;
    const stream = micSource.mediaStream;
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    audioChunks = [];
    hasSpoken = false;

    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };

    mediaRecorder.onstop = async () => {
        if (!isListening) return;
        
        // Only transcribe if some voice was actually detected
        if (audioChunks.length > 0 && hasSpoken) {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const buffer = await blob.arrayBuffer();
            
            recogStatusEl.textContent = 'TRANSCRIBING...';
            const result = await window.jarvis.transcribeAudio(buffer);
            
            if (result && result.text) {
                const cmd = result.text.trim();
                if (cmd.length > 1) {
                    transcriptBox.innerHTML = `"${cmd}"`;
                    log(cmd, 'user');
                    handleCommand(cmd);
                }
            } else if (result && result.error) {
                log(`Transcription Error: ${result.error}`, 'error');
            }
        }
        
        // Reset and restart for continuous listening if still active
        if (isListening) {
            audioChunks = [];
            hasSpoken = false;
            lastAudioTime = Date.now();
            try {
                mediaRecorder.start(500); // Collect data every 500ms
                recogStatusEl.textContent = 'LISTENING';
            } catch(e) {}
        }
    };

    mediaRecorder.start(500); // Request data every 0.5s
    recogStatusEl.textContent = 'LISTENING';
    lastAudioTime = Date.now();
    monitorSilence();
}

function monitorSilence() {
    if (!analyser || !isListening) return;

    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    
    const check = () => {
        if (!isListening) return;
        analyser.getByteTimeDomainData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            const v = (dataArray[i] - 128) / 128;
            sum += v * v;
        }
        const rms = Math.sqrt(sum / bufferLength);
        const now = Date.now();

        // Detect if user is speaking (Sensitivity threshold: 0.06)
        if (rms > 0.06) { 
            lastAudioTime = now;
            if (!hasSpoken) {
                hasSpoken = true;
                recogStatusEl.textContent = 'VOICE DETECTED';
            }
        } else { 
            // If user has spoken and then stayed silent for 1.2s
            if (hasSpoken && now - lastAudioTime > 1200) {
                if (mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
            }
            // If never spoken but listening for too long (prevent huge buffer), reset every 10s
            else if (!hasSpoken && now - lastAudioTime > 10000) {
                if (mediaRecorder.state === 'recording') {
                    audioChunks = [];
                    lastAudioTime = now;
                }
            }
        }
        requestAnimationFrame(check);
    };
    check();
}

voiceBtn.addEventListener('click', () => isListening ? stopVoiceLink() : startVoiceLink());

// ── LIVE INTEGRATIONS (Electron IPC) ─────────────────────────
const isElectron = !!window.jarvis;

// macOS Calendar
async function loadCalendarEvents() {
    if (!isElectron) return;
    const result = await window.jarvis.getCalendarEvents();
    if (result && Array.isArray(result)) {
        SCHEDULE = result;
        renderSchedule();
        log(`캘린더에서 오늘 일정 ${result.length}개를 불러왔습니다.`, 'sys');
    }
}

// macOS Reminders
async function loadReminders() {
    if (!isElectron) return;
    const result = await window.jarvis.getReminders();
    if (result && Array.isArray(result)) {
        REMINDERS = result;
        renderTodos();
        log(`미리알림 ${result.length}개를 불러왔습니다.`, 'sys');
    }
}

// Notion
async function loadNotionTasks() {
    if (!isElectron) return;
    const result = await window.jarvis.getNotionTasks();
    if (!result || result.error === 'NOTION_NOT_CONFIGURED') {
        log('노션 미연동. ⚙ 설정에서 토큰과 DB ID를 입력하세요.', 'sys'); return;
    }
    if (result.error) { log(`노션 오류: ${result.error}`, 'error'); return; }
    
    if (Array.isArray(result)) {
        ASSIGNMENTS = result.map(t => ({ title: t.title, dueDate: t.due ? t.due.split('T')[0] : '2099-12-31' }));
        renderAssignments();
        log(`노션에서 과제 ${result.length}개를 불러왔습니다.`, 'sys');
    }
}


// ── SETTINGS MODAL ────────────────────────────────────────────
const settingsBtn  = document.getElementById('settingsBtn');
const settingsModal= document.getElementById('settingsModal');
const modalClose   = document.getElementById('modalClose');
const modalSave    = document.getElementById('modalSave');
const notionTokenEl= document.getElementById('notionToken');
const notionDbIdEl = document.getElementById('notionDbId');
const groqApiKeyEl  = document.getElementById('groqApiKey');

async function openSettings() {
    settingsModal.classList.add('open');
    if (isElectron) {
        const cfg = await window.jarvis.getConfig();
        notionTokenEl.value = cfg.notionToken || '';
        notionDbIdEl.value  = cfg.notionDbId  || '';
        groqApiKeyEl.value  = cfg.groqApiKey  || '';
    }
}

settingsBtn?.addEventListener('click', openSettings);
modalClose?.addEventListener('click', () => settingsModal.classList.remove('open'));
settingsModal?.addEventListener('click', e => { if(e.target===settingsModal) settingsModal.classList.remove('open'); });

modalSave?.addEventListener('click', async () => {
    if (isElectron) {
        await window.jarvis.saveConfig({ 
            notionToken: notionTokenEl.value.trim(), 
            notionDbId: notionDbIdEl.value.trim(),
            groqApiKey: groqApiKeyEl.value.trim() 
        });
        jarvisSpeak('설정이 저장되었습니다.');
        settingsModal.classList.remove('open');
        setTimeout(() => {
            loadNotionTasks();
        }, 500);
    } else {
        jarvisSpeak('설정 저장은 Electron 앱에서만 가능합니다.');
        settingsModal.classList.remove('open');
    }
});

// ── BOOT ─────────────────────────────────────────────────────
(function boot(){
    renderSchedule(); renderAssignments(); renderTodos();
    fetchWeather();
    const msgs=[
        {t:300,  text:'Booting J.A.R.V.I.S Academic Secretary...', type:'sys'},
        {t:800,  text:'Holographic projection: ONLINE', type:'sys'},
        {t:1300, text:'Speech recognition engine: READY', type:'sys'},
        {t:1800, text:'모든 시스템 정상 가동. 환영합니다, 조영빈 씨.', type:'jarvis'},
        {t:2400, text:'"안녕 자비스"라고 말씀하시면 오늘의 브리핑을 시작합니다.', type:'jarvis'},
    ];
    msgs.forEach(m=>setTimeout(()=>log(m.text,m.type),m.t));

    // Load live data if running in Electron
    if (isElectron) {
        setTimeout(()=>{
            log('macOS 통합 데이터를 불러오는 중...', 'sys');
            loadCalendarEvents();
            loadReminders();
            loadNotionTasks();
        }, 2000);
    } else {
        setTimeout(()=>{ loadReminders(); }, 1000);
        setTimeout(()=>log('브라우저 모드: 캘린더/노션 연동은 Electron 앱에서 사용 가능합니다.','sys'), 3000);
    }
})();

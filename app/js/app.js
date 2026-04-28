// J.A.R.V.I.S Academic Secretary — app.js

// ── DATA ────────────────────────────────────────────────────
const SCHEDULE = [
    { subject:'인공지능 기초', start:'09:00', end:'10:30', loc:'공학관 201호', days:[1,4] },
    { subject:'운영체제',       start:'13:00', end:'14:30', loc:'공학관 305호', days:[2,5] },
    { subject:'데이터베이스',   start:'10:30', end:'12:00', loc:'정보관 102호', days:[3]   },
    { subject:'컴퓨터 네트워크', start:'15:00', end:'16:30', loc:'공학관 401호', days:[2]  },
];

const ASSIGNMENTS = [
    { subject:'인공지능 기초', title:'자비스 프로그램 제작 과제',   dueDate:'2026-05-10' },
    { subject:'운영체제',      title:'스케줄링 알고리즘 분석 리포트', dueDate:'2026-05-15' },
    { subject:'데이터베이스',  title:'ERD 설계 및 SQL 구현',         dueDate:'2026-05-20' },
];

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
let recognition, isListening = false;
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
    const dow   = new Date().getDay();
    const now   = new Date();
    const nowM  = now.getHours()*60 + now.getMinutes();
    const items = SCHEDULE.filter(s => s.days.includes(dow))
                          .sort((a,b) => timeToMins(a.start) - timeToMins(b.start));

    if (!items.length) {
        scheduleList.innerHTML = '<div class="no-class">📚 오늘은 수업이 없습니다</div>';
        return;
    }

    scheduleList.innerHTML = items.map(s => {
        const startM = timeToMins(s.start), endM = timeToMins(s.end);
        const cls = nowM >= startM && nowM < endM ? 'current' : nowM >= endM ? 'done' : '';
        return `<div class="schedule-item ${cls}">
            <div class="sch-time">${s.start} – ${s.end}</div>
            <div class="sch-subject">${s.subject}</div>
            <div class="sch-loc">📍 ${s.loc}</div>
        </div>`;
    }).join('');
}

// ── ASSIGNMENT RENDER ────────────────────────────────────────
function renderAssignments() {
    const sorted = [...ASSIGNMENTS].sort((a,b) => calcDday(a.dueDate) - calcDday(b.dueDate));
    assignmentList.innerHTML = sorted.map(a => {
        const d   = calcDday(a.dueDate);
        const cls = ddayClass(d);
        const label = d === 0 ? 'D-DAY' : d < 0 ? '완료' : `D-${d}`;
        return `<div class="assign-item ${cls}">
            <div class="assign-info">
                <div class="assign-subject">${a.subject}</div>
                <div class="assign-title">${a.title}</div>
                <div class="assign-due">마감: ${a.dueDate}</div>
            </div>
            <div class="dday-badge ${cls}">${label}</div>
        </div>`;
    }).join('');

    const pending = sorted.filter(a => calcDday(a.dueDate) >= 0).length;
    taskCountEl.textContent = `${pending} pending`;
}

// ── TODO ─────────────────────────────────────────────────────
function loadTodos()    { return JSON.parse(localStorage.getItem('jarvis_todos') || '[]'); }
function saveTodos(arr) { localStorage.setItem('jarvis_todos', JSON.stringify(arr)); }

function renderTodos() {
    const todos = loadTodos();
    if (!todos.length) { todoList.innerHTML = '<div class="empty-msg">할 일이 없습니다</div>'; return; }
    todoList.innerHTML = todos.map(t => `
        <div class="todo-item" data-id="${t.id}">
            <input type="checkbox" class="todo-check" ${t.done?'checked':''} onchange="toggleTodo(${t.id})">
            <span class="todo-text ${t.done?'done':''}">${t.text}</span>
            <button class="todo-del" onclick="deleteTodo(${t.id})">✕</button>
        </div>`).join('');
}

function addTodo(text) {
    if (!text.trim()) return;
    const todos = loadTodos();
    todos.push({ id: Date.now(), text: text.trim(), done: false });
    saveTodos(todos); renderTodos();
}

function toggleTodo(id) {
    const todos = loadTodos().map(t => t.id===id ? {...t, done:!t.done} : t);
    saveTodos(todos); renderTodos();
}

function deleteTodo(id) {
    saveTodos(loadTodos().filter(t => t.id!==id)); renderTodos();
}

todoAddBtn.addEventListener('click', () => { addTodo(todoInput.value); todoInput.value=''; });
todoInput.addEventListener('keydown', e => { if(e.key==='Enter'){ addTodo(todoInput.value); todoInput.value=''; } });

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

// ── COMMAND HANDLER ───────────────────────────────────────────
function handleCommand(raw) {
    const cmd = raw.toLowerCase().replace(/[.,!?]/g,'').trim();
    recogStatusEl.textContent = 'PROCESSING';

    setTimeout(()=>{
        recogStatusEl.textContent = 'LISTENING';

        if (match(cmd,['안녕','하이','반가','자비스'])) {
            doBriefing();
        }
        else if (match(cmd,['시간','몇 시','몇시'])) {
            const n=new Date(), ap=n.getHours()<12?'오전':'오후', h12=n.getHours()%12||12;
            jarvisSpeak(`현재 시각은 ${ap} ${h12}시 ${n.getMinutes()}분입니다.`);
        }
        else if (match(cmd,['날짜','오늘','며칠','몇월'])) {
            const n=new Date();
            jarvisSpeak(`오늘은 ${n.getFullYear()}년 ${n.getMonth()+1}월 ${n.getDate()}일 ${DAYS_KO[n.getDay()]}요일입니다.`);
        }
        else if (match(cmd,['날씨','기온','비','맑'])) {
            fetchWeather().then(w=>{ jarvisSpeak(w?`현재 서울 날씨: ${w.desc}, ${w.temp}°C`:'날씨 정보를 가져올 수 없습니다.'); });
        }
        else if (match(cmd,['일정','수업','강의'])) {
            const items=SCHEDULE.filter(s=>s.days.includes(new Date().getDay()));
            if(items.length) items.forEach(s=>jarvisSpeak(`${s.start}~${s.end} ${s.subject} (${s.loc})`));
            else jarvisSpeak('오늘은 수업이 없습니다.');
        }
        else if (match(cmd,['과제','마감','제출','d-day','디데이'])) {
            const sorted=[...ASSIGNMENTS].sort((a,b)=>calcDday(a.dueDate)-calcDday(b.dueDate));
            sorted.forEach(a=>jarvisSpeak(`D-${calcDday(a.dueDate)} | ${a.subject}: ${a.title} (${a.dueDate})`));
        }
        else if (match(cmd,['할 일 추가','todo','추가해'])) {
            const text = raw.replace(/할 일 추가|todo|추가해/gi,'').trim();
            if(text){ addTodo(text); jarvisSpeak(`할 일 "${text}"을(를) 등록했습니다.`); }
            else    { jarvisSpeak('추가할 내용을 함께 말씀해주세요. 예: "할 일 추가 발표 자료 준비"'); }
        }
        else if (match(cmd,['힘내','응원','격려','힘들'])) {
            jarvisSpeak(pick(['토니 스타크도 동굴에서 시작했습니다. 포기하지 마세요.','잘 하고 있습니다. 조금만 더 파이팅!','어려운 상황도 반드시 끝납니다. 응원합니다.']));
        }
        else if (match(cmd,['도움말','뭐 할','기능','명령'])) {
            jarvisSpeak('사용 가능: 안녕 자비스(브리핑) / 시간 / 날짜 / 날씨 / 오늘 일정 / 과제 마감 / 할 일 추가 [내용] / 힘내');
        }
        else if (match(cmd,['종료','꺼줘','바이','잘가'])) {
            jarvisSpeak('시스템을 절전 모드로 전환합니다. 수고하셨습니다.');
            setTimeout(()=>stopVoiceLink(), 2000);
        }
        else {
            jarvisSpeak(pick([`"${raw}" 명령을 인식하지 못했습니다. "도움말"을 말씀해주세요.`,'다시 한 번 말씀해주시겠어요?']));
        }
    }, 350);
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

// ── VOICE RECOGNITION ────────────────────────────────────────
function initRecognition() {
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){ log('SpeechRecognition not supported. Use Chrome.','error'); return null; }
    const rec=new SR(); rec.lang='ko-KR'; rec.continuous=true; rec.interimResults=true;

    rec.onstart=()=>{ recogStatusEl.textContent='LISTENING'; };
    rec.onresult=(e)=>{
        let interim='', final='';
        for(let i=e.resultIndex;i<e.results.length;i++){
            const t=e.results[i][0].transcript;
            e.results[i].isFinal ? final+=t : interim+=t;
        }
        transcriptBox.innerHTML = interim ? `<span class="interim">${interim}</span>` : '<span class="transcript-placeholder">"안녕 자비스" 라고 말해보세요</span>';
        if(final){ const cmd=final.trim(); transcriptBox.innerHTML=`"${cmd}"`; log(cmd,'user'); handleCommand(cmd); }
    };
    rec.onerror=(e)=>{ if(e.error!=='no-speech') log(`Recognition error: ${e.error}`,'error'); };
    rec.onend=()=>{ recogStatusEl.textContent='IDLE'; if(isListening) setTimeout(()=>{try{rec.start();}catch(e){}},300); };
    return rec;
}

// ── VOICE LINK ────────────────────────────────────────────────
async function startVoiceLink() {
    isListening=true;
    voiceBtn.classList.add('listening'); voiceBtnLabel.textContent='TERMINATE VOICE LINK';
    micDot.classList.add('active'); micStatusText.textContent='VOICE LINK ONLINE';
    await startAudio();
    recognition=initRecognition();
    if(recognition){ try{recognition.start();}catch(e){} jarvisSpeak('음성 링크가 활성화되었습니다. "안녕 자비스" 라고 말씀해보세요.'); }
}

function stopVoiceLink() {
    isListening=false;
    voiceBtn.classList.remove('listening'); voiceBtnLabel.textContent='ACTIVATE VOICE LINK';
    micDot.classList.remove('active'); micStatusText.textContent='VOICE LINK OFFLINE';
    if(recognition){try{recognition.stop();}catch(e){} recognition=null;}
    stopAudio(); recogStatusEl.textContent='IDLE';
    transcriptBox.innerHTML='<span class="transcript-placeholder">"안녕 자비스" 라고 말해보세요</span>';
    arcCore.style.transform='scale(1)'; arcCore.style.boxShadow='';
    log('Voice link terminated.','sys');
}

voiceBtn.addEventListener('click', ()=> isListening ? stopVoiceLink() : startVoiceLink());

// ── LIVE INTEGRATIONS (Electron IPC) ─────────────────────────
const isElectron = !!window.jarvis;

// macOS Calendar
async function loadCalendarEvents() {
    if (!isElectron) return;
    const result = await window.jarvis.getCalendarEvents();
    if (!result || result.error) {
        if (result?.error) log(result.error, 'error');
        return;
    }
    if (!result.length) return;
    // Inject calendar events into schedule panel
    const calSection = document.createElement('div');
    calSection.innerHTML = `<div class="panel-header" style="margin-top:14px">CALENDAR — 오늘 <span style="font-size:.5rem;color:#00ff88">● LIVE</span></div>`;
    const list = document.createElement('div');
    list.className = 'schedule-list';
    result.forEach(ev => {
        const item = document.createElement('div');
        item.className = 'schedule-item';
        item.innerHTML = `<div class="sch-time">${ev.start || ''}</div><div class="sch-subject">${ev.title}</div>`;
        list.appendChild(item);
    });
    calSection.appendChild(list);
    document.querySelector('.left-panel').appendChild(calSection);
    log(`캘린더에서 오늘 일정 ${result.length}개를 불러왔습니다.`, 'sys');
}

// macOS Reminders
async function loadReminders() {
    if (!isElectron) { document.getElementById('reminderList').innerHTML = '<div class="empty-msg">Electron 앱에서 실행 시 표시됩니다</div>'; return; }
    const result = await window.jarvis.getReminders();
    const el = document.getElementById('reminderList');
    if (!el) return;
    if (!result || result.error) { el.innerHTML = `<div class="empty-msg">${result?.error || '미리알림 없음'}</div>`; return; }
    if (!result.length) { el.innerHTML = '<div class="empty-msg">미완료 미리알림이 없습니다</div>'; return; }
    el.innerHTML = result.map(r => `
        <div class="schedule-item">
            <div class="sch-subject">🔔 ${r.name}</div>
            ${r.due ? `<div class="sch-loc">마감: ${r.due}</div>` : ''}
        </div>`).join('');
    log(`미리알림 ${result.length}개를 불러왔습니다.`, 'sys');
}

// Notion
async function loadNotionTasks() {
    if (!isElectron) return;
    const result = await window.jarvis.getNotionTasks();
    if (!result || result.error === 'NOTION_NOT_CONFIGURED') {
        log('노션 미연동. ⚙ 설정에서 토큰과 DB ID를 입력하세요.', 'sys'); return;
    }
    if (result.error) { log(`노션 오류: ${result.error}`, 'error'); return; }
    if (!result.length) { log('노션에서 진행 중인 과제가 없습니다.', 'sys'); return; }

    // Merge Notion tasks into assignment panel
    const panel = document.getElementById('assignmentList');
    result.forEach(task => {
        const d   = task.due ? calcDday(task.due) : null;
        const cls = d !== null ? ddayClass(d) : 'normal';
        const badge = d !== null ? (d===0?'D-DAY':d<0?'완료':`D-${d}`) : '―';
        const el = document.createElement('div');
        el.className = `assign-item ${cls}`;
        el.innerHTML = `
            <div class="assign-info">
                <div class="assign-subject">NOTION</div>
                <div class="assign-title">${task.title}</div>
                ${task.due ? `<div class="assign-due">마감: ${task.due}</div>` : ''}
            </div>
            <div class="dday-badge ${cls}">${badge}</div>`;
        panel.appendChild(el);
    });
    log(`노션에서 과제 ${result.length}개를 불러왔습니다.`, 'sys');
}

// ── SETTINGS MODAL ────────────────────────────────────────────
const settingsBtn  = document.getElementById('settingsBtn');
const settingsModal= document.getElementById('settingsModal');
const modalClose   = document.getElementById('modalClose');
const modalSave    = document.getElementById('modalSave');
const notionTokenEl= document.getElementById('notionToken');
const notionDbIdEl = document.getElementById('notionDbId');

async function openSettings() {
    settingsModal.classList.add('open');
    if (isElectron) {
        const cfg = await window.jarvis.getConfig();
        notionTokenEl.value = cfg.notionToken || '';
        notionDbIdEl.value  = cfg.notionDbId  || '';
    }
}

settingsBtn?.addEventListener('click', openSettings);
modalClose?.addEventListener('click', () => settingsModal.classList.remove('open'));
settingsModal?.addEventListener('click', e => { if(e.target===settingsModal) settingsModal.classList.remove('open'); });

modalSave?.addEventListener('click', async () => {
    if (isElectron) {
        await window.jarvis.saveConfig({ notionToken: notionTokenEl.value.trim(), notionDbId: notionDbIdEl.value.trim() });
        jarvisSpeak('설정이 저장되었습니다. 노션 연동을 다시 시도합니다.');
        settingsModal.classList.remove('open');
        setTimeout(loadNotionTasks, 500);
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

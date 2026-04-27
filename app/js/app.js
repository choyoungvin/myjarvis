// ============================================================
//  J.A.R.V.I.S — Academic Command Center
//  Engine: Web Audio API (visualizer) + Web Speech API (voice)
// ============================================================

// ── DOM References ──────────────────────────────────────────
const voiceBtn         = document.getElementById('voiceBtn');
const voiceBtnLabel    = document.getElementById('voiceBtnLabel');
const micDot           = document.getElementById('micDot');
const micStatusText    = document.getElementById('micStatusText');
const consoleOutput    = document.getElementById('consoleOutput');
const transcriptBox    = document.getElementById('transcriptBox');
const clockDisplay     = document.getElementById('clockDisplay');
const arcCore          = document.getElementById('arcCore');
const audioStatusEl    = document.getElementById('audioStatus');
const recogStatusEl    = document.getElementById('recognitionStatus');
const canvas           = document.getElementById('waveCanvas');
const ctx              = canvas.getContext('2d');

// ── State ────────────────────────────────────────────────────
let audioCtx, analyser, source, animFrameId;
let recognition;
let isListening = false;

// ── Canvas sizing ────────────────────────────────────────────
function resizeCanvas() {
    const wrapper = canvas.parentElement;
    canvas.width  = wrapper.offsetWidth;
    canvas.height = wrapper.offsetHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ── Clock ────────────────────────────────────────────────────
function updateClock() {
    const now  = new Date();
    const hh   = String(now.getHours()).padStart(2,'0');
    const mm   = String(now.getMinutes()).padStart(2,'0');
    const ss   = String(now.getSeconds()).padStart(2,'0');
    clockDisplay.textContent = `${hh}:${mm}:${ss}`;
}
setInterval(updateClock, 1000);
updateClock();

// ── Simulated System Stats (fluctuate for realism) ──────────
function updateStats() {
    const ids = ['cpu','mem','net'];
    const bases = [42, 68, 25];
    ids.forEach((id, i) => {
        const val = Math.min(98, Math.max(5, bases[i] + (Math.random() * 12 - 6)));
        const rounded = Math.round(val);
        document.getElementById(`${id}Bar`).style.width = `${rounded}%`;
        document.getElementById(`${id}Val`).textContent  = `${rounded}%`;
    });
}
setInterval(updateStats, 2500);

// ── Console Logging ──────────────────────────────────────────
function log(text, type = 'sys') {
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    const prefix = type === 'jarvis' ? '▸ JARVIS: '
                 : type === 'user'   ? '▸ YOU: '
                 : type === 'error'  ? '✖ ERROR: '
                 : '◈ SYS: ';
    line.textContent = prefix + text;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// Typewriter effect for Jarvis responses
function jarvisSpeak(text) {
    const line = document.createElement('div');
    line.className = 'log-line jarvis';
    line.textContent = '▸ JARVIS: ';
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;

    let i = 0;
    const interval = setInterval(() => {
        line.textContent += text[i];
        i++;
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
        if (i >= text.length) clearInterval(interval);
    }, 28);
}

// ── Canvas Waveform Visualizer ───────────────────────────────
function drawWave(volume = 0) {
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const baseR = Math.min(W, H) / 2 * 0.38;

    ctx.clearRect(0, 0, W, H);

    if (!analyser || !isListening) {
        // Idle: gentle single sine ring
        drawIdleRing(cx, cy, baseR);
        return;
    }

    const bufferLen = analyser.frequencyBinCount;
    const dataArr   = new Uint8Array(bufferLen);
    analyser.getByteFrequencyData(dataArr);

    // Compute average amplitude
    let sum = 0;
    for (let i = 0; i < bufferLen; i++) sum += dataArr[i];
    const avg = sum / bufferLen;

    // Drive arc core brightness
    const scale = 1 + (avg / 120);
    arcCore.style.transform  = `scale(${scale})`;
    arcCore.style.boxShadow  = `0 0 ${20 + avg * 0.8}px rgba(0,229,255,${0.4 + avg/200}), 0 0 ${40 + avg}px rgba(0,229,255,${0.2 + avg/400})`;

    // Draw N concentric waveform rings (radial bars)
    const rings = 3;
    for (let r = 0; r < rings; r++) {
        const ringRadius = baseR + r * 22;
        const alpha      = 1 - r * 0.28;
        const step       = Math.floor(bufferLen / 128);
        const points     = 128;

        ctx.beginPath();
        for (let i = 0; i < points; i++) {
            const freq  = dataArr[i * step] || 0;
            const amp   = (freq / 255) * (20 + r * 8);
            const angle = (i / points) * Math.PI * 2 - Math.PI / 2;
            const rad   = ringRadius + amp;
            const x     = cx + Math.cos(angle) * rad;
            const y     = cy + Math.sin(angle) * rad;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(0, 229, 255, ${alpha * 0.85})`;
        ctx.lineWidth   = 1.5 - r * 0.3;
        ctx.shadowBlur  = 10;
        ctx.shadowColor = 'rgba(0, 229, 255, 0.6)';
        ctx.stroke();
        ctx.shadowBlur  = 0;
    }

    // Draw outer shimmer ring
    const shimmerR = baseR + rings * 22 + avg * 0.15;
    ctx.beginPath();
    ctx.arc(cx, cy, shimmerR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0, 229, 255, ${Math.min(0.5, avg / 200)})`;
    ctx.lineWidth   = 0.5;
    ctx.stroke();
}

function drawIdleRing(cx, cy, baseR) {
    const t   = Date.now() / 1000;
    const amp = 4 * Math.sin(t * 1.5) + 4;

    ctx.beginPath();
    for (let i = 0; i <= 128; i++) {
        const angle = (i / 128) * Math.PI * 2 - Math.PI / 2;
        const wave  = amp * Math.sin(angle * 6 + t * 2);
        const r     = baseR + wave;
        const x     = cx + Math.cos(angle) * r;
        const y     = cy + Math.sin(angle) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
    ctx.lineWidth   = 1.2;
    ctx.shadowBlur  = 8;
    ctx.shadowColor = 'rgba(0, 229, 255, 0.4)';
    ctx.stroke();
    ctx.shadowBlur  = 0;

    // Reset core to normal
    arcCore.style.transform = 'scale(1)';
    arcCore.style.boxShadow = '';
}

function renderLoop() {
    drawWave();
    animFrameId = requestAnimationFrame(renderLoop);
}
renderLoop();

// ── Audio Setup ──────────────────────────────────────────────
async function startAudio() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
        analyser  = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.8;
        source    = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        audioStatusEl.textContent = 'ACTIVE';
        log('Microphone stream acquired.', 'sys');
    } catch (e) {
        log('Microphone access denied.', 'error');
        audioStatusEl.textContent = 'DENIED';
    }
}

function stopAudio() {
    if (audioCtx) { audioCtx.close(); audioCtx = null; analyser = null; source = null; }
    audioStatusEl.textContent = 'STANDBY';
}

// ── Voice Recognition ────────────────────────────────────────
function initRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        log('SpeechRecognition not supported in this browser.', 'error');
        jarvisSpeak('죄송합니다. 이 브라우저는 음성 인식을 지원하지 않습니다. Chrome을 사용해주세요.');
        return null;
    }

    const rec = new SR();
    rec.lang = 'ko-KR';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onstart = () => {
        recogStatusEl.textContent = 'LISTENING';
        log('Speech recognition engine started.', 'sys');
    };

    rec.onresult = (event) => {
        let interim = '';
        let final   = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) final += transcript;
            else interim += transcript;
        }

        // Show interim in the transcript box
        transcriptBox.innerHTML = interim
            ? `<span class="interim">${interim}</span>`
            : '<span class="transcript-placeholder">음성 입력 대기 중...</span>';

        if (final) {
            const cmd = final.trim();
            transcriptBox.innerHTML = `<span style="color:#fff">"${cmd}"</span>`;
            log(cmd, 'user');
            handleCommand(cmd);
        }
    };

    rec.onerror = (e) => {
        if (e.error === 'no-speech') return;
        log(`Recognition error: ${e.error}`, 'error');
    };

    rec.onend = () => {
        recogStatusEl.textContent = 'IDLE';
        // Auto-restart if still listening
        if (isListening) {
            setTimeout(() => { try { rec.start(); } catch(e){} }, 300);
        }
    };

    return rec;
}

// ── Command Handler ──────────────────────────────────────────
function handleCommand(raw) {
    const cmd = raw.toLowerCase().replace(/[.,!?]/g, '').trim();
    recogStatusEl.textContent = 'PROCESSING';

    setTimeout(() => {
        recogStatusEl.textContent = 'LISTENING';

        // ── Greetings ──
        if (match(cmd, ['안녕','하이','헬로','반가워','좋은 아침','좋은 저녁'])) {
            const greets = [
                '안녕하세요. 오늘도 열심히 해봅시다.',
                '안녕하세요. J.A.R.V.I.S 시스템이 정상 가동 중입니다.',
                '반갑습니다. 무엇을 도와드릴까요?'
            ];
            jarvisSpeak(pick(greets));
        }

        // ── Time ──
        else if (match(cmd, ['시간','몇 시','지금 몇시','현재 시간'])) {
            const now = new Date();
            const h = now.getHours(), m = now.getMinutes();
            const ampm = h < 12 ? '오전' : '오후';
            const h12  = h % 12 || 12;
            jarvisSpeak(`현재 시각은 ${ampm} ${h12}시 ${m}분입니다.`);
        }

        // ── Date ──
        else if (match(cmd, ['날짜','오늘 날짜','오늘이 몇월','몇 월 며칠'])) {
            const now  = new Date();
            const days = ['일','월','화','수','목','금','토'];
            jarvisSpeak(`오늘은 ${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 ${days[now.getDay()]}요일입니다.`);
        }

        // ── Process list ──
        else if (match(cmd, ['프로세스','실행 중인','앱 목록','무슨 앱','어떤 앱'])) {
            jarvisSpeak('현재 실행 중인 주요 프로세스를 분석 중입니다. 브라우저 기반 환경에서는 시스템 접근이 제한됩니다. Python 백엔드 연동 시 실제 프로세스 목록을 제공할 수 있습니다.');
            log('참고: 실제 프로세스 목록은 Python 백엔드(psutil) 연동이 필요합니다.', 'sys');
        }

        // ── File extension change ──
        else if (match(cmd, ['파일 정리','확장자','파일 변경','파일 바꿔'])) {
            jarvisSpeak('파일 확장자 일괄 변경 기능은 Python 스크립트와 연동되어 있습니다. 변경할 폴더 경로와 목표 확장자를 말씀해 주시면 처리해드리겠습니다.');
        }

        // ── Weather ──
        else if (match(cmd, ['날씨','비 와','맑아','흐려'])) {
            jarvisSpeak('날씨 정보를 가져오려면 외부 API 연동이 필요합니다. 현재는 네트워크 접근이 제한된 환경입니다. 실시간 날씨 기능을 추가하시려면 말씀해주세요.');
        }

        // ── Timer / Pomodoro ──
        else if (match(cmd, ['타이머','집중','포모도로','분 타이머'])) {
            const minutes = parseInt(cmd.match(/(\d+)\s*분/)?.[1]) || 25;
            startTimer(minutes);
            jarvisSpeak(`${minutes}분 집중 타이머를 시작합니다. 파이팅!`);
        }

        // ── Stop timer ──
        else if (match(cmd, ['타이머 취소','타이머 멈춰','집중 종료'])) {
            clearTimer();
            jarvisSpeak('집중 타이머를 종료했습니다.');
        }

        // ── System info ──
        else if (match(cmd, ['시스템 정보','내 컴퓨터','사양 알려줘','정보 알려줘'])) {
            const ua = navigator.userAgent;
            const platform = navigator.platform;
            jarvisSpeak(`감지된 플랫폼: ${platform}. 화면 해상도: ${screen.width}×${screen.height}. 논리 CPU 코어: ${navigator.hardwareConcurrency}개. 언어: ${navigator.language}.`);
        }

        // ── Calculator / Math ──
        else if (match(cmd, ['계산해줘','얼마야','더하기','빼기','곱하기','나누기'])) {
            const expr = cmd.replace(/[^0-9+\-*/().]/g, '');
            try {
                // eslint-disable-next-line no-eval
                const result = Function(`"use strict"; return (${expr})`)();
                jarvisSpeak(`계산 결과는 ${result} 입니다.`);
            } catch {
                jarvisSpeak('수식을 인식하지 못했습니다. 예: "3 더하기 4 계산해줘"');
            }
        }

        // ── Motivation ──
        else if (match(cmd, ['힘내','응원','격려','위로','힘들어'])) {
            const motivations = [
                '어떤 어려운 상황도 당신이라면 헤쳐나갈 수 있습니다.',
                '잠깐의 휴식 후 다시 도전해보세요. 당신은 충분히 잘하고 있습니다.',
                '토니 스타크도 처음에는 동굴에서 시작했습니다. 포기하지 마세요.'
            ];
            jarvisSpeak(pick(motivations));
        }

        // ── Help ──
        else if (match(cmd, ['도움말','뭘 할 수 있어','뭐 할 수 있어','기능','명령어'])) {
            jarvisSpeak('사용 가능한 명령: 안녕 / 시간 알려줘 / 오늘 날짜 / 프로세스 보여줘 / 파일 정리해줘 / 날씨 어때 / 타이머 25분 / 시스템 정보 / 힘내 / 계산해줘.');
        }

        // ── Shutdown / Bye ──
        else if (match(cmd, ['종료','바이','잘 있어','잘 가','꺼줘'])) {
            jarvisSpeak('J.A.R.V.I.S 시스템을 절전 모드로 전환합니다. 수고하셨습니다.');
            setTimeout(() => stopVoiceLink(), 2000);
        }

        // ── Unknown ──
        else {
            const fallbacks = [
                `"${raw}" 명령은 인식되지 않았습니다. '도움말'을 말씀해주세요.`,
                '죄송합니다, 다시 말씀해주시겠어요?',
                '명확히 인식하지 못했습니다. 더 또렷하게 말씀해주세요.'
            ];
            jarvisSpeak(pick(fallbacks));
        }
    }, 400);
}

// ── Utility: keyword match ───────────────────────────────────
function match(cmd, keywords) {
    return keywords.some(k => cmd.includes(k));
}
function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ── Timer Logic ──────────────────────────────────────────────
let timerInterval = null;
let timerEndTime  = null;

function startTimer(minutes) {
    clearTimer();
    timerEndTime = Date.now() + minutes * 60 * 1000;
    timerInterval = setInterval(() => {
        const remaining = timerEndTime - Date.now();
        if (remaining <= 0) {
            clearTimer();
            log('집중 타이머가 종료되었습니다!', 'jarvis');
            jarvisSpeak('집중 시간이 끝났습니다. 잠시 휴식을 취하세요.');
        } else {
            const m = Math.floor(remaining / 60000);
            const s = Math.floor((remaining % 60000) / 1000);
            clockDisplay.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        }
    }, 1000);
}

function clearTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    // Restore clock
    updateClock();
    setInterval(updateClock, 1000);
}

// ── Voice Link Toggle ────────────────────────────────────────
async function startVoiceLink() {
    isListening = true;

    // UI Update
    voiceBtn.classList.add('listening');
    voiceBtnLabel.textContent = 'TERMINATE VOICE LINK';
    micDot.classList.add('active');
    micStatusText.textContent = 'VOICE LINK ONLINE';

    log('Initializing audio subsystem...', 'sys');
    await startAudio();

    recognition = initRecognition();
    if (recognition) {
        try { recognition.start(); } catch(e) {}
        jarvisSpeak('음성 링크가 활성화되었습니다. 명령을 말씀해주세요.');
    }
}

function stopVoiceLink() {
    isListening = false;

    voiceBtn.classList.remove('listening');
    voiceBtnLabel.textContent = 'ACTIVATE VOICE LINK';
    micDot.classList.remove('active');
    micStatusText.textContent = 'VOICE LINK OFFLINE';

    if (recognition) { try { recognition.stop(); } catch(e){} recognition = null; }
    stopAudio();
    recogStatusEl.textContent = 'IDLE';

    transcriptBox.innerHTML = '<span class="transcript-placeholder">음성 입력 대기 중...</span>';
    arcCore.style.transform = 'scale(1)';
    arcCore.style.boxShadow = '';

    log('Voice link terminated.', 'sys');
}

voiceBtn.addEventListener('click', () => {
    if (!isListening) startVoiceLink();
    else              stopVoiceLink();
});

// ── Boot Sequence ────────────────────────────────────────────
(function boot() {
    const messages = [
        { t:  200, text: 'Booting J.A.R.V.I.S kernel...', type: 'sys' },
        { t:  700, text: 'Loading acoustic analysis module...', type: 'sys' },
        { t: 1200, text: 'Holographic projection: ONLINE', type: 'sys' },
        { t: 1700, text: 'Speech recognition engine: READY', type: 'sys' },
        { t: 2200, text: 'All systems nominal. Welcome.', type: 'sys' },
        { t: 2800, text: '안녕하세요. 음성 링크를 활성화하려면 버튼을 누르세요.', type: 'jarvis' },
    ];
    messages.forEach(m => setTimeout(() => log(m.text, m.type), m.t));
})();

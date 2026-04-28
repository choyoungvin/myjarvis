# J.A.R.V.I.S — Academic Secretary 🦾

> **"Just A Rather Very Intelligent System"**  
> 아이언맨의 자비스에서 영감을 받은 **대학생 전용 학업 비서 AI 프로그램**

![Version](https://img.shields.io/badge/version-2.0.0-cyan.svg)
![Platform](https://img.shields.io/badge/platform-Google_Chrome-orange.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

---

## 🌟 프로그램 소개

J.A.R.V.I.S는 단순한 시스템 도구를 넘어, 대학 생활의 반복적이고 번거로운 정보 확인 작업을 **AI 음성 비서**가 대신 처리해주는 학업 지원 프로그램입니다.

매일 아침 **"안녕 자비스"** 한 마디로 오늘의 날씨, 수업 일정, 과제 마감을 한 번에 브리핑받을 수 있습니다.

---

## ✨ 주요 기능

| 기능 | 설명 |
|---|---|
| 🎙 **음성 브리핑** | "안녕 자비스" 한 마디로 날씨·일정·과제 종합 보고 |
| 📅 **오늘의 수업** | 요일별 수업 일정 자동 표시, 현재 수업 강조 |
| ⚠ **과제 D-Day** | 마감일 기준 D-Day 자동 계산 및 색상 경보 |
| ✅ **할 일 목록** | 음성 또는 타이핑으로 할 일 추가/완료/삭제 |
| 🌤 **실시간 날씨** | wttr.in API 연동, 서울 날씨 실시간 반영 |
| 🌊 **홀로그램 시각화** | 목소리에 반응하는 아크 리액터형 방사형 파형 |

---

## 🛠 기술 스택

- **Frontend**: HTML5, CSS3, JavaScript ES6+
- **Voice**: Web Speech API `(ko-KR)`
- **Audio Visualizer**: Web Audio API + Canvas 2D
- **Weather**: wttr.in API (무료, API 키 불필요)
- **Storage**: Browser localStorage
- **Font**: Orbitron, Share Tech Mono (Google Fonts)

---

## 🚀 실행 방법

```bash
# 1. 저장소 클론
git clone https://github.com/사용자이름/jarvis-ai.git

# 2. Chrome으로 실행 (더블클릭 또는 아래 명령어)
open -a "Google Chrome" jarvis-ai/app/index.html
```

> ⚠ **반드시 Google Chrome에서 실행하세요.**  
> Safari·Firefox는 Web Speech API를 지원하지 않습니다.

1. `app/index.html`을 Chrome으로 엽니다.
2. **[ACTIVATE VOICE LINK]** 버튼 클릭
3. 마이크 권한 허용
4. **"안녕 자비스"** 라고 말하기

---

## 🎤 음성 명령어

```
"안녕 자비스"      → 오늘의 종합 브리핑
"시간 알려줘"      → 현재 시각
"오늘 날짜"        → 날짜 및 요일
"날씨 어때"        → 실시간 날씨
"오늘 일정"        → 오늘 수업 목록
"과제 마감 알려줘" → 전체 D-Day 현황
"할 일 추가 [내용]"→ 할 일 등록
"힘내"             → 격려 메시지
"도움말"           → 전체 명령어 안내
```

---

## 📁 프로젝트 구조

```
jarvis-ai/
├── app/
│   ├── index.html      # 메인 UI
│   ├── css/
│   │   └── styles.css  # HUD 디자인 시스템
│   └── js/
│       └── app.js      # 음성 인식 + 비서 로직
├── MANUAL.md           # 프로그램 사용 매뉴얼 (AI Agent 활용)
└── README.md           # 프로젝트 설명서
```

---

## 📜 제출 정보

- **제작자**: 202644009 조영빈
- **과목**: 인공지능 기초
- **AI 협업**: 본 프로그램의 기획·설계·구현 전 과정은 AI Agent(Antigravity)와의 협업을 통해 제작되었습니다.

---

© 2026 J.A.R.V.I.S Academic Secretary — Inspired by Marvel's Iron Man.

// 브라우저 음성 인식(SpeechRecognition)으로 말소리를 글자로 바꿔 메모리에만 모아 둬요.
// 음성 파일은 만들지 않고, 글자도 takeText()로 꺼내 분석한 뒤 버려요.
import { countWords } from './analyzer.js';

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export class Recorder {
  constructor({ lang = 'ko-KR', onWords = () => {}, onError = () => {} } = {}) {
    this.lang = lang;
    this.onWords = onWords;
    this.onError = onError;
    this.active = false;
    this.buffer = '';
    this.rec = null;
    this.fails = 0;
  }

  get supported() {
    return Boolean(SR);
  }

  start() {
    if (!SR || this.active) return;
    this.active = true;
    this.buffer = '';
    this.fails = 0;
    this._spawn();
  }

  stop() {
    this.active = false;
    try {
      this.rec && this.rec.stop();
    } catch {
      /* 이미 멈춘 경우 */
    }
  }

  takeText() {
    const t = this.buffer;
    this.buffer = '';
    this.onWords(0);
    return t;
  }

  _spawn() {
    if (!this.active) return;
    const r = new SR();
    r.lang = this.lang;
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      this.fails = 0;
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        if (e.results[i].isFinal) this.buffer += ` ${e.results[i][0].transcript}`;
      }
      this.onWords(countWords(this.buffer));
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.active = false;
        this.onError('mic-denied');
      } else if (e.error === 'network') {
        this.onError('network');
      }
    };
    r.onend = () => {
      if (!this.active) return;
      // 크롬은 잠깐씩 인식을 끊기 때문에 켜져 있는 동안은 다시 시작해요.
      this.fails += 1;
      const delay = Math.min(300 * 2 ** Math.min(this.fails, 5), 5000);
      setTimeout(() => this._spawn(), delay);
    };
    this.rec = r;
    try {
      r.start();
    } catch {
      setTimeout(() => this._spawn(), 1000);
    }
  }
}

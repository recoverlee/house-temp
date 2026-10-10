// 대화 한 덩어리(글자) -> 분위기 점수 -> 온도.
// 규칙 기반이라 브라우저 안에서만 계산해요. 글자는 어디에도 보내거나 저장하지 않아요.
import { CONFIG } from './config.js';

export const MIN_WORDS = 8;

const STRONG_NEG = [
  '소리 지르', '소리지르', '그만해', '그만 좀', '닥쳐', '시끄러', '짜증', '화나', '화내', '화가',
  '싫어', '죽겠', '미치겠', '혼나', '혼날', '야단', '도대체', '제발', '몇 번', '몇번',
  '왜 안', '왜 이래', '안 한다고', '내가 말했', '말 좀 들어', '말 안 들',
];
const MILD_NEG = [
  '빨리', '얼른', '공부 안', '공부 좀', '숙제 안', '학원 가', '게임 그만', '핸드폰 그만',
  '휴대폰 그만', '안 돼', '안돼', '하지 마', '하지마', '아직도', '늦었',
];
const STRONG_POS = [
  '사랑해', '고마워', '고맙', '잘했', '최고', '대단', '축하', '자랑', '행복',
  '재밌', '재미있', '웃겨', '맛있', '좋아', '좋다', '귀엽',
];
const MILD_POS = [
  '하하', '호호', '헤헤', '같이', '함께', '괜찮', '알았어', '알겠', '미안', '수고', '먹자', '놀자', '보자',
];

const STUDY = /공부|숙제|학원|시험|성적|문제집|과외|학교|받아쓰기|수학|영어/;
const LAUGH = /하하|호호|헤헤|웃겨|웃기|깔깔/;

export const TAG_LABEL = {
  study: '공부 이야기',
  tension: '언성',
  laugh: '웃음',
  warm: '칭찬·고마움',
  manual: '직접 기록',
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function count(text, term, cap = 3) {
  let n = 0;
  let i = 0;
  while (n < cap && (i = text.indexOf(term, i)) !== -1) {
    n += 1;
    i += term.length;
  }
  return n;
}

export function countWords(text) {
  const t = (text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

export function analyze(text) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  const words = countWords(t);
  let raw = 0;
  for (const w of STRONG_NEG) raw -= 3 * count(t, w);
  for (const w of MILD_NEG) raw -= 1.2 * count(t, w);
  for (const w of STRONG_POS) raw += 3 * count(t, w);
  for (const w of MILD_POS) raw += 1.2 * count(t, w);

  const denom = 6 + words / 40;
  const score = words < MIN_WORDS ? 0 : Math.tanh((1.2 * raw) / denom);

  const tags = [];
  if (STUDY.test(t)) tags.push('study');
  if (score <= -0.3) tags.push('tension');
  if (LAUGH.test(t)) tags.push('laugh');
  if (score >= 0.3) tags.push('warm');
  return { score, words, tags };
}

export function scoreToTemp(score) {
  const { min, max, neutral } = CONFIG.tempRange;
  const t = score >= 0 ? neutral + score * (max - neutral) : neutral + score * (neutral - min);
  return Math.round(clamp(t, min, max) * 10) / 10;
}

export function bandFor(temp) {
  if (temp == null) return null;
  if (temp < 17) return { key: 'freeze', label: '꽁꽁 얼었어요' };
  if (temp < 20) return { key: 'cool', label: '쌀쌀해요' };
  if (temp < 24) return { key: 'mild', label: '포근해요' };
  if (temp < 27) return { key: 'warm', label: '따뜻해요' };
  return { key: 'hot', label: '후끈해요' };
}

const COMMENTS = {
  freeze: {
    study: [
      '공부 얘기가 오가며 분위기가 많이 식었어요. 퇴근길에 간식을 하나 사 가서 먼저 가볍게 말을 걸어 보세요.',
      '공부 문제로 집안이 꽁꽁 얼었어요. 집에 들어가면 결과보다 오늘 하루가 어땠는지부터 물어봐 주세요.',
    ],
    tension: [
      '목소리가 높아진 시간이 있었어요. 들어가서 바로 해결하려 하기보다 먼저 들어주는 쪽이 좋겠어요.',
      '언성이 오간 저녁이었어요. 따뜻한 음료나 간식으로 분위기를 풀어 보면 어떨까요?',
    ],
    default: ['오늘은 집안 공기가 많이 차가웠어요. 따뜻한 한마디로 시작해 보세요.'],
  },
  cool: {
    study: [
      '공부 문제로 살짝 쌀쌀한 저녁이었어요. 가족 모두에게 수고했다는 말부터 건네 보세요.',
      '공부 얘기로 분위기가 조금 가라앉았어요. 간식이나 짧은 산책을 제안해 보면 어떨까요?',
    ],
    default: [
      '조금 쌀쌀한 저녁이었어요. 좋아하는 간식 하나가 도움이 될 거예요.',
      '살짝 가라앉은 분위기였어요. 오늘 하루 어땠는지 먼저 물어봐 주세요.',
    ],
  },
  mild: {
    study: [
      '공부 얘기가 있었지만 무난하게 지나갔어요. 평소처럼 들어가셔도 괜찮아요.',
      '공부 이야기가 나왔지만 분위기는 안정적이었어요.',
    ],
    default: ['차분하고 평범한 저녁이었어요.', '큰 일 없이 조용히 지나간 저녁이에요.'],
  },
  warm: {
    laugh: ['웃음소리가 꽤 있었어요. 집안이 따뜻해요.', '웃음이 오간 저녁이었어요. 편하게 들어가세요.'],
    default: ['분위기가 좋은 저녁이었어요. 편하게 들어가세요.', '따뜻한 대화가 오간 저녁이었어요.'],
  },
  hot: {
    default: [
      '웃음과 칭찬이 오간 저녁이었어요. 집에 가는 길이 가볍겠어요.',
      '집안이 후끈할 만큼 좋은 분위기였어요.',
    ],
  },
};

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function commentFor(temp, tags, seed = '') {
  const band = bandFor(temp);
  if (!band) return '';
  const group = COMMENTS[band.key];
  let list = group.default;
  if (band.key === 'freeze') {
    if (tags.includes('study')) list = group.study;
    else if (tags.includes('tension')) list = group.tension;
  } else if (band.key === 'cool' || band.key === 'mild') {
    if (tags.includes('study')) list = group.study;
  } else if (band.key === 'warm') {
    if (tags.includes('laugh')) list = group.laugh;
  }
  return list[hash(seed + band.key) % list.length];
}

export function dayKey(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 하루치 기록 -> 대표 온도, 태그, 한 줄 코멘트
export function summarizeDay(list) {
  const count_ = list.length;
  const real = list.filter((r) => !r.quiet && typeof r.temp === 'number');
  const tags = [...new Set(list.flatMap((r) => r.tags || []).filter((t) => t !== 'quiet'))];
  if (!real.length) {
    return {
      temp: null,
      count: count_,
      tags,
      band: null,
      comment: count_ ? '대화가 거의 없는 조용한 저녁이었어요.' : '아직 측정된 기록이 없어요.',
    };
  }
  let sum = 0;
  let wsum = 0;
  for (const r of real) {
    const w = r.source === 'manual' ? 120 : clamp(r.words || 0, 20, 400);
    sum += r.temp * w;
    wsum += w;
  }
  const temp = Math.round((sum / wsum) * 10) / 10;
  const seed = list[0].day || '';
  return { temp, count: count_, tags, band: bandFor(temp), comment: commentFor(temp, tags, seed) };
}

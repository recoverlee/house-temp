import assert from 'node:assert/strict';
import { analyze, scoreToTemp, bandFor, summarizeDay, commentFor } from '../analyzer.js';

const filler = (n) => Array.from({ length: n }, () => '그래서 오늘은').join(' ');

// 다툰 구간: 낮은 온도, 긴장·공부 태그
const fight = analyze(
  `야 빨리 숙제 해 왜 안 하는 거야 내가 몇 번을 말했어 제발 좀 들어 짜증 나 정말 그만 좀 해 빨리 얼른 ${filler(120)}`,
);
assert.ok(fight.score < -0.3, `fight score ${fight.score}`);
assert.ok(fight.tags.includes('tension') && fight.tags.includes('study'));
assert.ok(scoreToTemp(fight.score) < 19, `fight temp ${scoreToTemp(fight.score)}`);

// 화목한 구간: 높은 온도, 웃음·칭찬 태그
const happy = analyze(
  `와 잘했네 최고다 하하 맛있겠다 고마워 같이 먹자 재밌다 사랑해 괜찮아 하하 호호 ${filler(120)}`,
);
assert.ok(happy.score > 0.3, `happy score ${happy.score}`);
assert.ok(happy.tags.includes('laugh') && happy.tags.includes('warm'));
assert.ok(scoreToTemp(happy.score) > 24, `happy temp ${scoreToTemp(happy.score)}`);

// 평범한 구간: 22도 근처
const plain = analyze(`밥 먹었어 오늘 학교 어땠어 숙제는 이따가 하자 ${filler(150)}`);
const plainTemp = scoreToTemp(plain.score);
assert.ok(plainTemp >= 19 && plainTemp <= 25, `plain temp ${plainTemp}`);

// 너무 짧은 말은 점수에 영향을 주지 않음
assert.equal(analyze('네').score, 0);
assert.equal(scoreToTemp(0), 22);

// 범위 제한
assert.equal(scoreToTemp(1), 30);
assert.equal(scoreToTemp(-1), 14);

// 구간 라벨
assert.equal(bandFor(15).key, 'freeze');
assert.equal(bandFor(18).key, 'cool');
assert.equal(bandFor(22).key, 'mild');
assert.equal(bandFor(25).key, 'warm');
assert.equal(bandFor(29).key, 'hot');
assert.equal(bandFor(null), null);

// 하루 요약: 단어 수 가중 평균, 조용한 구간은 제외
const day = summarizeDay([
  { day: '2026-10-10', ts: 1, temp: 18, words: 100, tags: ['study', 'tension'] },
  { day: '2026-10-10', ts: 2, temp: 26, words: 100, tags: ['laugh'] },
  { day: '2026-10-10', ts: 3, quiet: true, words: 0, tags: ['quiet'] },
]);
assert.equal(day.temp, 22);
assert.equal(day.count, 3);
assert.deepEqual(day.tags.sort(), ['laugh', 'study', 'tension']);
assert.ok(day.comment.length > 0);

// 기록이 없거나 조용하기만 한 날
assert.equal(summarizeDay([]).temp, null);
assert.equal(summarizeDay([]).count, 0);
const quietOnly = summarizeDay([{ day: '2026-10-10', ts: 1, quiet: true, words: 0, tags: ['quiet'] }]);
assert.equal(quietOnly.temp, null);
assert.equal(quietOnly.count, 1);

// 같은 날짜는 항상 같은 코멘트
assert.equal(commentFor(18, ['study'], '2026-10-10'), commentFor(18, ['study'], '2026-10-10'));

console.log('analyzer tests passed');

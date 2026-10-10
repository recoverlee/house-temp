// 기록 저장소. Firebase 설정이 있으면 Firestore(여러 기기 동기화), 없으면 이 기기의 localStorage.
// 저장되는 것은 시각, 온도, 태그, 단어 수뿐이에요. 대화 글자와 음성은 저장하지 않아요.
import { CONFIG } from './config.js';

export async function createStore(code) {
  if (CONFIG.firebase) return firebaseStore(code);
  return localStore(code);
}

export function localStore(code) {
  const key = `jibon:readings:${code}`;
  const listeners = new Set();
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  };
  const write = (arr) => {
    try {
      localStorage.setItem(key, JSON.stringify(arr.slice(-800)));
    } catch {
      /* 저장 공간이 막혀 있으면 무시 */
    }
  };
  const emit = () => {
    const data = read();
    listeners.forEach((fn) => fn(data));
  };
  window.addEventListener('storage', (e) => {
    if (e.key === key) emit();
  });
  return {
    mode: 'local',
    async add(r) {
      const arr = read();
      arr.push({ ...r, id: `${r.ts}-${Math.random().toString(36).slice(2, 8)}` });
      write(arr);
      emit();
    },
    subscribe(cb) {
      listeners.add(cb);
      cb(read());
      return () => listeners.delete(cb);
    },
    async clearDay(day) {
      write(read().filter((r) => r.day !== day));
      emit();
    },
  };
}

async function firebaseStore(code) {
  const base = 'https://www.gstatic.com/firebasejs/10.12.2';
  const [{ initializeApp }, fs] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  const { getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot, getDocs, where, writeBatch } = fs;
  const db = getFirestore(initializeApp(CONFIG.firebase));
  const col = collection(db, 'homes', code, 'readings');
  return {
    mode: 'firebase',
    async add(r) {
      await addDoc(col, r);
    },
    subscribe(cb, onError) {
      return onSnapshot(
        query(col, orderBy('ts', 'desc'), limit(600)),
        (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse()),
        (err) => onError && onError(err),
      );
    },
    async clearDay(day) {
      const snap = await getDocs(query(col, where('day', '==', day)));
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    },
  };
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 명조(시나리오 제목·단계 이름)와 산세리프(나머지 글자). 글자 범위별로 나뉘어 있어 쓰인 글자 묶음만 내려받는다.
import '@fontsource-variable/noto-serif-kr';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './App';
import { installAudioUnlock } from './lib/sound';

installAudioUnlock();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// 인터넷이 끊겨도 앱 화면을 열 수 있도록 서비스 워커를 등록한다(배포 빌드에서만).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

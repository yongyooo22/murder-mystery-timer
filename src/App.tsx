import { useEffect } from 'react';
import { ToastProvider } from './components/Toast';
import { APP_CONFIG } from './config';
import { refreshScenarios } from './data/scenarioStore';
import { useRoute, type Route } from './lib/router';
import { EditScreen } from './screens/EditScreen';
import { ListScreen } from './screens/ListScreen';
import { PlayScreen } from './screens/PlayScreen';
import { ResultScreen } from './screens/ResultScreen';
import { TrashScreen } from './screens/TrashScreen';

const TITLES: Record<Route['name'], string | null> = {
  list: null,
  detail: null,
  new: '새 시나리오',
  edit: '시나리오 편집',
  play: '게임 진행',
  result: '진행 결과',
  trash: '휴지통',
};

export function App() {
  const route = useRoute();

  // 목록은 앱을 열 때 한 번만 불러온다. 이후에는 새로고침 버튼으로만 다시 불러온다.
  useEffect(() => {
    void refreshScenarios();
  }, []);

  useEffect(() => {
    const title = TITLES[route.name];
    document.title = title ? `${title} · ${APP_CONFIG.name}` : APP_CONFIG.name;
    if (route.name !== 'detail' && route.name !== 'list') window.scrollTo(0, 0);
  }, [route]);

  return (
    <ToastProvider>
      {(route.name === 'list' || route.name === 'detail') && (
        <ListScreen detailId={route.name === 'detail' ? route.id : null} />
      )}
      {route.name === 'new' && <EditScreen key={`new:${route.template ?? ''}`} templateKey={route.template} />}
      {route.name === 'edit' && <EditScreen key={`edit:${route.id}`} scenarioId={route.id} />}
      {route.name === 'play' && <PlayScreen />}
      {route.name === 'result' && <ResultScreen />}
      {route.name === 'trash' && <TrashScreen />}
    </ToastProvider>
  );
}

import { useFullscreen } from '../lib/device';
import { IconButton } from './Button';

/** 주소창·탭을 숨기는 전체화면 전환 버튼. 전체화면을 쓸 수 없는 브라우저(예: iPhone Safari)에서는 보이지 않는다. */
export function FullscreenButton({ size = 20 }: { size?: number }) {
  const fullscreen = useFullscreen();
  if (!fullscreen.supported) return null;
  return (
    <IconButton
      icon={fullscreen.active ? 'minimize' : 'maximize'}
      label={fullscreen.active ? '전체화면 끝내기' : '전체화면'}
      size={size}
      onClick={() => void fullscreen.toggle()}
    />
  );
}

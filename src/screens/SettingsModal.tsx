import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Switch } from '../components/Switch';
import { APP_CONFIG } from '../config';
import { updateSettings, useSettings } from '../data/settingsStore';
import { vibrate, vibrationSupported, wakeLockSupported } from '../lib/device';
import { playAlert, soundSupported } from '../lib/sound';
import './SettingsModal.css';

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useSettings();
  const canVibrate = vibrationSupported();
  const canKeepAwake = wakeLockSupported();
  const canPlay = soundSupported();

  return (
    <Modal open={open} onClose={onClose} title="설정" showClose className="modal--wide">
      <div className="settings">
        <section className="settings__group">
          <h3 className="settings__heading">알림</h3>
          <Switch
            icon="bell"
            label="시간 종료 알림음"
            description="단계 시간이 끝나면 부드러운 알림음이 울려요."
            checked={settings.timeUpSound}
            disabled={!canPlay}
            onChange={(timeUpSound) => updateSettings({ timeUpSound })}
          />
          <Switch
            icon="clock"
            label="1분 전 알림음"
            description="남은 시간이 1분이 되면 짧게 한 번 울려요."
            checked={settings.warningSound}
            disabled={!canPlay}
            onChange={(warningSound) => updateSettings({ warningSound })}
          />
          <div className="settings__preview">
            <Button size="sm" icon="volume" onClick={() => playAlert('timeUp')} disabled={!canPlay}>
              알림음 들어보기
            </Button>
          </div>
          <Switch
            icon="vibrate"
            label="진동"
            description={canVibrate ? '알림음과 함께 진동해요.' : '이 기기·브라우저에서는 진동을 쓸 수 없어요.'}
            checked={canVibrate && settings.vibration}
            disabled={!canVibrate}
            onChange={(vibration) => {
              updateSettings({ vibration });
              if (vibration) vibrate(120);
            }}
          />
        </section>

        <section className="settings__group">
          <h3 className="settings__heading">화면</h3>
          <Switch
            icon="sun"
            label="진행 중 화면 꺼짐 방지"
            description={
              canKeepAwake
                ? '게임 진행 화면에서는 화면이 꺼지지 않아요.'
                : '이 브라우저에서는 쓸 수 없어요. 기기 설정에서 자동 잠금 시간을 늘려 주세요.'
            }
            checked={canKeepAwake && settings.keepAwake}
            disabled={!canKeepAwake}
            onChange={(keepAwake) => updateSettings({ keepAwake })}
          />

          <h3 className="settings__heading">저장 위치</h3>
          <p className="settings__note">
            시나리오 목록과 휴지통은 서버에 저장되어 모든 사용자에게 공유돼요. 설정과 진행 중인 게임은 이 기기에만
            저장돼요.
          </p>
          <p className="settings__version" lang="en">
            {APP_CONFIG.name}
          </p>
        </section>
      </div>
    </Modal>
  );
}

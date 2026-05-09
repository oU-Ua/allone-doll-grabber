import { Game } from './game/Game';
import { HUD } from './ui/HUD';
import { plays } from './state/plays';
import { collection } from './state/collection';
import { streak } from './state/streak';
import { DPAD } from './config/game';
import { settings } from './state/settings';
import { sounds } from './audio/Sounds';
import { missions } from './state/missions';
import { achievements } from './state/achievements';
import { ACHIEVEMENTS } from './config/achievements';

async function bootstrap() {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

  let lastMoveTime = performance.now();
  const hud = new HUD({
    onGrab: () => game.tryGrab(),
    onCameraPreset: (p) => game.setCameraPreset(p),
    onToggleAutoRotate: () => game.toggleAutoRotate(),
    onMove: (sx, sz) => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastMoveTime) / 1000);
      lastMoveTime = now;
      game.moveCraneFixed(sx, sz, dt, DPAD.speedPerSec);
    },
    onRefill: () => plays.refill(),
    onDifficulty: (d) => game.setDifficulty(d),
    onTheme: (t) => {
      game.setTheme(t);
      achievements.markThemeUsed(t);
      detectAchievements();
    },
    onSaveCamera: () => game.saveCustomCamera(),
    onLoadCamera: () => game.loadCustomCamera(),
    onMissionComplete: (id) => {
      // 백엔드 미연동 — UI에서 진행도+1
      missions.bump(id, 1);
      hud.flashStatus('미션 진행도가 갱신됐어요');
    },
  });

  // 모바일 자동재생 정책 회피 + 저장된 mute 상태 적용
  const onFirstInput = () => {
    sounds.resume();
    sounds.setMuted(settings.get().muted);
    window.removeEventListener('pointerdown', onFirstInput);
    window.removeEventListener('keydown', onFirstInput);
  };
  window.addEventListener('pointerdown', onFirstInput);
  window.addEventListener('keydown', onFirstInput);

  const game = new Game(canvas, {
    onStateText: (text) => hud.setStatusText(text),
    onSuccess: handleSuccess,
    onFail: handleFail,
    onLoadProgress: (loaded, total) => hud.showLoading(loaded, total),
  });

  // 잡기 버튼이 클릭되었을 때 — HUD 가 onGrab → game.tryGrab() 을 부르지만,
  // 그 전에 횟수 차감을 검증하기 위해 game.tryGrab 을 래핑합니다.
  const originalTryGrab = game.tryGrab.bind(game);
  game.tryGrab = async () => {
    if (!game.isIdle()) return;
    if (!plays.consume()) {
      hud.showFail('miss');
      hud.setStatusText('오늘의 기회를 모두 사용했어요!');
      return;
    }
    hud.refreshPlays();
    hud.setGrabEnabled(false);
    try {
      await originalTryGrab();
    } finally {
      hud.setGrabEnabled(true);
      hud.refreshPlays();
    }
  };

  await game.load();
  hud.hideLoading();
  game.start();

  function handleSuccess(dollId: string): void {
    streak.win();
    const { isNew } = collection.add(dollId);

    // 미션: 오늘의 첫 플레이 (자동 진행)
    missions.bump('play-once', 1);

    // 컬렉션 완성 검사 (§3.2.2)
    const newCompletions = collection.detectNewCompletions();
    for (const cat of newCompletions) {
      plays.grant(3); // §3.2.3 — 추가 플레이 기회 보상
      hud.refreshPlays();
      hud.showCompletionToast(cat);
    }

    // 성취 자동 감지 (§3.2.4)
    detectAchievements();

    hud.showReward(dollId, isNew, (kind, amount) => {
      // 백엔드 연동 전 mock — 임시 저장 / 인벤토리 등록은 HUD 내부에서 처리
      console.log(`[reward] kind=${kind} amount=${amount}`);
    });
  }

  function handleFail(reason: 'no-doll' | 'mid-air-drop' | 'miss'): void {
    streak.reset();
    // 실패해도 미션 '오늘 첫 플레이' 는 진행
    missions.bump('play-once', 1);
    hud.showFail(reason);
  }

  function detectAchievements(): void {
    const newly = achievements.detect();
    if (newly.length === 0) return;
    for (const id of newly) {
      const def = ACHIEVEMENTS.find((a) => a.id === id);
      if (def) {
        sounds.collect();
        hud.flashStatus(`${def.emoji} 성취 달성: ${def.title}`);
      }
    }
  }

  // 처음 진입 시 (테마/스트릭 변화 등) 성취 한 번 감지
  achievements.markThemeUsed(settings.get().theme);
  detectAchievements();
}

bootstrap().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#fff;padding:24px;">로딩 실패: ${err?.message ?? err}</pre>`;
});

import { plays } from '../state/plays';
import { collection } from '../state/collection';
import { DOLL_BY_ID, DOLLS, RARITY_LABEL, type Category, type Rarity } from '../config/dolls';
import { REWARD } from '../config/game';
import { settings, type Difficulty, type ThemeId } from '../state/settings';
import { sounds } from '../audio/Sounds';
import { tickets, type Ticket } from '../state/tickets';
import { missions } from '../state/missions';
import { MISSIONS, type MissionTrigger } from '../config/missions';
import { achievements } from '../state/achievements';
import { ACHIEVEMENTS } from '../config/achievements';
import { referral } from '../state/referral';
import { auth } from '../state/auth';
import type { CameraPreset } from '../game/CameraRig';

export type InventoryTab = 'cards' | 'tickets' | 'missions' | 'achievements' | 'referral';

export interface HUDHandlers {
  onGrab: () => void;
  onCameraPreset: (p: CameraPreset) => void;
  onToggleAutoRotate: () => boolean;
  /** sx,sz: 화면 기준 정규화 입력 (-1~1). Game 에서 월드축에 그대로 적용. */
  onMove: (sx: number, sz: number) => void;
  onRefill: () => void;
  onDifficulty: (d: Difficulty) => void;
  onTheme: (t: ThemeId) => void;
  onSaveCamera: () => void;
  onLoadCamera: () => boolean;
  /** 미션 수동 완료 (백엔드 미연동 mock — 게임 클라이언트에서 진행도+1) */
  onMissionComplete: (id: MissionTrigger) => void;
}

/**
 * 모든 DOM UI 의 단일 진입점.
 * Game 인스턴스와의 양방향 통신을 핸들러로 추상화합니다.
 */
export class HUD {
  private $playsRemaining = $('plays-remaining');
  private $playsMax = $('plays-max');
  private $status = $('status');
  private $btnGrab = $('btn-grab') as HTMLButtonElement;
  private $btnCollection = $('btn-collection');
  private $btnHelp = $('btn-help');
  private $btnAuto = $('btn-auto-rotate');
  private $rewardModal = $('reward-modal');
  private $rewardTitle = $('reward-title');
  private $rewardDoll = $('reward-doll');
  private $rewardMessage = $('reward-message');
  private $rewardPoints = $('reward-points') as HTMLButtonElement;
  private $rewardTicket = $('reward-ticket') as HTMLButtonElement;
  private $rewardTimer = $('reward-timer');
  private $rewardAfter = $('reward-after');
  private $rewardGoApp = $('reward-go-app') as HTMLButtonElement;
  private $failToast = $('fail-toast');
  private $inventoryModal = $('inventory-modal');
  private $collectionGrid = $('collection-grid');
  private $collectionProgress = $('collection-progress');
  private $tutorialModal = $('tutorial-modal');
  private $loading = $('loading');
  private $loadingText = document.querySelector('.loading-text') as HTMLElement;
  private $loadingTip = $('loading-tip');

  private rewardTimerHandle: number | null = null;
  private currentRarityFilter: Rarity | 'all' = 'all';
  private currentCategoryFilter: Category | 'all' = 'all';
  private currentSort: 'recent' | 'rarity' | 'category' = 'recent';
  private currentTab: InventoryTab = 'cards';

  /** 현재 눌려있는 방향들 (D-pad / 키보드 합산) */
  private pressed = new Set<'up' | 'down' | 'left' | 'right'>();
  /** D-pad 입력을 매 프레임 흘려보내는 RAF 루프 핸들 */
  private moveRaf = 0;

  constructor(private handlers: HUDHandlers) {
    this.wire();
    this.wireDPad();
    this.wireKeyboard();
    this.wireSettings();
    this.wireRefill();
    this.wireCameraExtras();
    this.wireInventoryTabs();
    this.wireCollectionFilters();
    this.wireReferral();
    this.wireRewardAfter();
    this.refreshPlays();
    this.refreshCustomCamButton();
    this.refreshTabBadges();
    this.maybeShowTutorial();
    this.showRandomLoadingTip();
  }

  private wire(): void {
    this.$btnGrab.addEventListener('click', () => {
      if (this.$btnGrab.disabled) return;
      // 잔여 횟수 검증은 main.ts 에서 → 여기서는 핸들러만 호출
      this.handlers.onGrab();
    });

    document.querySelectorAll<HTMLButtonElement>('.cam-btn[data-cam]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cam-btn[data-cam]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.$btnAuto.classList.remove('active');
        this.handlers.onCameraPreset(btn.dataset.cam as CameraPreset);
      });
    });

    this.$btnAuto.addEventListener('click', () => {
      const on = this.handlers.onToggleAutoRotate();
      this.$btnAuto.classList.toggle('active', on);
      if (on) {
        document.querySelectorAll('.cam-btn[data-cam]').forEach((b) => b.classList.remove('active'));
      }
    });

    this.$btnCollection.addEventListener('click', () => { sounds.tap(); this.openInventory(); });
    this.$btnHelp.addEventListener('click', () => { sounds.tap(); this.$tutorialModal.classList.remove('hidden'); });
    $('btn-settings').addEventListener('click', () => { sounds.tap(); this.openSettings(); });
    document.querySelectorAll<HTMLButtonElement>('.modal-close').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.close!;
        $(id).classList.add('hidden');
      });
    });
    /* 필터 wire 는 wireCollectionFilters() 로 이동 */

    $('tutorial-close').addEventListener('click', () => {
      this.$tutorialModal.classList.add('hidden');
      try {
        localStorage.setItem('allone-doll:tutorial-seen', '1');
      } catch { /* */ }
    });
  }

  private wireDPad(): void {
    const dpad = $('dpad');
    const startPress = (dir: 'up' | 'down' | 'left' | 'right', btn: HTMLElement) => {
      this.pressed.add(dir);
      btn.classList.add('pressed');
      this.ensureMoveLoop();
    };
    const endPress = (dir: 'up' | 'down' | 'left' | 'right', btn: HTMLElement) => {
      this.pressed.delete(dir);
      btn.classList.remove('pressed');
    };
    dpad.querySelectorAll<HTMLButtonElement>('.dpad-btn').forEach((btn) => {
      const dir = btn.dataset.dir as 'up' | 'down' | 'left' | 'right';
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        startPress(dir, btn);
      });
      const release = (e: PointerEvent) => {
        try { btn.releasePointerCapture(e.pointerId); } catch { /* */ }
        endPress(dir, btn);
      };
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
    });
  }

  private wireKeyboard(): void {
    const keyMap: Record<string, 'up' | 'down' | 'left' | 'right'> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
      W: 'up', S: 'down', A: 'left', D: 'right',
    };
    window.addEventListener('keydown', (e) => {
      const dir = keyMap[e.key];
      if (dir) {
        e.preventDefault();
        this.pressed.add(dir);
        this.ensureMoveLoop();
        const btn = document.querySelector<HTMLButtonElement>(`.dpad-${dir}`);
        btn?.classList.add('pressed');
      } else if (e.key === ' ' || e.key === 'Enter') {
        if (!this.$btnGrab.disabled) {
          e.preventDefault();
          this.handlers.onGrab();
        }
      }
    });
    window.addEventListener('keyup', (e) => {
      const dir = keyMap[e.key];
      if (dir) {
        this.pressed.delete(dir);
        const btn = document.querySelector<HTMLButtonElement>(`.dpad-${dir}`);
        btn?.classList.remove('pressed');
      }
    });
    window.addEventListener('blur', () => {
      this.pressed.clear();
      document.querySelectorAll('.dpad-btn.pressed').forEach((b) => b.classList.remove('pressed'));
    });
  }

  private ensureMoveLoop(): void {
    if (this.moveRaf) return;
    const tick = () => {
      if (this.pressed.size === 0) {
        this.moveRaf = 0;
        return;
      }
      let sx = 0, sz = 0;
      if (this.pressed.has('left')) sx -= 1;
      if (this.pressed.has('right')) sx += 1;
      if (this.pressed.has('up')) sz -= 1;
      if (this.pressed.has('down')) sz += 1;
      // 대각선 정규화
      if (sx !== 0 && sz !== 0) {
        const inv = 1 / Math.sqrt(2);
        sx *= inv;
        sz *= inv;
      }
      this.handlers.onMove(sx, sz);
      this.moveRaf = requestAnimationFrame(tick);
    };
    this.moveRaf = requestAnimationFrame(tick);
  }

  private maybeShowTutorial(): void {
    try {
      if (localStorage.getItem('allone-doll:tutorial-seen') !== '1') {
        this.$tutorialModal.classList.remove('hidden');
      }
    } catch { /* */ }
  }

  setStatusText(text: string): void {
    this.$status.textContent = text;
  }

  refreshPlays(): void {
    const p = plays.get();
    this.$playsRemaining.textContent = String(p.remaining);
    this.$playsMax.textContent = String(p.max);
    this.$btnGrab.disabled = p.remaining <= 0;
  }

  setGrabEnabled(enabled: boolean): void {
    const p = plays.get();
    this.$btnGrab.disabled = !enabled || p.remaining <= 0;
  }

  showLoading(loaded: number, total: number): void {
    if (total === 0) {
      this.$loadingText.textContent = '준비 중...';
      return;
    }
    this.$loadingText.textContent = `인형 불러오는 중... (${loaded}/${total})`;
  }

  hideLoading(): void {
    this.$loading.classList.add('hidden');
    setTimeout(() => this.$loading.style.display = 'none', 500);
  }

  showFail(reason: 'no-doll' | 'mid-air-drop' | 'miss'): void {
    const msg = {
      'no-doll': '인형이 집게 아래에 없어요!',
      'mid-air-drop': '아쉬워요... 도중에 놓쳤어요!',
      'miss': '아쉬워요... 다시 도전!',
    }[reason];
    this.$failToast.textContent = msg;
    this.$failToast.classList.remove('hidden');
    setTimeout(() => this.$failToast.classList.add('hidden'), 1800);
  }

  showReward(dollId: string, isNew: boolean, onChoice: (kind: 'points' | 'ticket', amount: number | string) => void): void {
    const def = DOLL_BY_ID[dollId];
    if (!def) return;

    this.$rewardTitle.textContent = isNew ? '🎉 새 인형 획득!' : '🎉 성공!';
    this.$rewardDoll.textContent = def.emoji;
    this.$rewardMessage.innerHTML = isNew
      ? `<b>${def.name}</b> (${RARITY_LABEL[def.rarity]}) 카드를 새로 획득했어요!`
      : `<b>${def.name}</b> 인형을 또 잡았어요. 보상을 받아보세요.`;

    // 보상 모달이 새로 열릴 때마다 상태 초기화
    this.$rewardPoints.disabled = false;
    this.$rewardTicket.disabled = false;
    this.$rewardAfter.classList.add('hidden');

    this.$rewardModal.classList.remove('hidden');

    let remaining = REWARD.selectTimeoutSec;
    this.$rewardTimer.textContent = `${remaining}초 안에 선택해주세요`;
    if (this.rewardTimerHandle) clearInterval(this.rewardTimerHandle);
    this.rewardTimerHandle = window.setInterval(() => {
      remaining -= 1;
      this.$rewardTimer.textContent = `${remaining}초 안에 선택해주세요`;
      if (remaining <= 0) {
        // 시간 초과 → 자동 포인트 지급 (§2.1.1 30초 제한)
        this.finishReward('points', onChoice);
      }
    }, 1000);

    this.$rewardPoints.onclick = () => this.finishReward('points', onChoice);
    this.$rewardTicket.onclick = () => this.finishReward('ticket', onChoice);
  }

  private finishReward(kind: 'points' | 'ticket', onChoice: (k: 'points' | 'ticket', amt: number | string) => void): void {
    if (this.rewardTimerHandle) {
      clearInterval(this.rewardTimerHandle);
      this.rewardTimerHandle = null;
    }
    // §2.1.4 — 중복 선택 방지
    this.$rewardPoints.disabled = true;
    this.$rewardTicket.disabled = true;

    let amount: number | string;
    if (kind === 'points') {
      amount = Math.floor(REWARD.pointsMin + Math.random() * (REWARD.pointsMax - REWARD.pointsMin));
      // §2.2.3 — 비인증 사용자는 임시 보관, 추후 연동 시 일괄 적립
      if (!auth.isLinked()) auth.stashReward('points', amount);
    } else {
      const categories = ['스타벅스 1만원권', '치킨 세트', '편의점 5천원권', '커피 쿠폰', '영화 1매'];
      const category = categories[(Math.random() * categories.length) | 0];
      amount = category;
      // §2.1.3 — 응모권 인벤토리에 추가
      tickets.add(category);
      if (!auth.isLinked()) auth.stashReward('ticket', 1);
    }
    onChoice(kind, amount);

    const linkedNote = auth.isLinked()
      ? '올원뱅크 앱에서 바로 확인 가능합니다.'
      : '아직 앱 연동 전이라 <b>임시 보관</b> 됐어요. 연동하면 자동 적립!';
    this.$rewardMessage.innerHTML =
      kind === 'points'
        ? `🪙 <b>${amount}P</b> 적립 완료!<br/><span style="font-size:12px;color:var(--c-ink-soft)">${linkedNote}</span>`
        : `🎟️ <b>${amount}</b> 응모권 획득!<br/><span style="font-size:12px;color:var(--c-ink-soft)">'내 정보 → 응모권' 에서 결과 확인</span>`;
    this.$rewardTimer.textContent = '';
    this.$rewardAfter.classList.remove('hidden');
    this.refreshTabBadges();
  }

  /** 외부에서 호출 가능한 진입점 (기존 코드 호환) */
  openCollection(): void {
    this.openInventory('cards');
  }

  openInventory(tab: InventoryTab = 'cards'): void {
    this.currentTab = tab;
    this.applyTabUi();
    this.refreshTabBadges();
    this.renderTab(tab);
    this.$inventoryModal.classList.remove('hidden');
  }

  private applyTabUi(): void {
    document.querySelectorAll<HTMLButtonElement>('.inv-tab').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === this.currentTab);
    });
    document.querySelectorAll<HTMLElement>('.inv-panel').forEach((p) => {
      p.classList.toggle('hidden', p.dataset.panel !== this.currentTab);
    });
  }

  private renderTab(tab: InventoryTab): void {
    if (tab === 'cards') this.renderCollection();
    else if (tab === 'tickets') this.renderTickets();
    else if (tab === 'missions') this.renderMissions();
    else if (tab === 'achievements') this.renderAchievements();
    else if (tab === 'referral') this.renderReferral();
  }

  private wireInventoryTabs(): void {
    document.querySelectorAll<HTMLButtonElement>('.inv-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        sounds.tap();
        this.currentTab = btn.dataset.tab as InventoryTab;
        this.applyTabUi();
        this.renderTab(this.currentTab);
      });
    });
  }

  refreshTabBadges(): void {
    const t = tickets.list().filter((x) => x.status === 'pending').length;
    const m = missions.summary().ready;
    const setBadge = (id: string, n: number) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = String(n);
      el.classList.toggle('hidden', n <= 0);
    };
    setBadge('badge-tickets', t);
    setBadge('badge-missions', m);
  }

  // ── 카드 (컬렉션) 렌더 + 필터 ────────────────────────────
  private wireCollectionFilters(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sounds.tap();
        document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentRarityFilter = (btn.dataset.filter as Rarity | 'all');
        this.renderCollection();
      });
    });
    document.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sounds.tap();
        document.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentCategoryFilter = btn.dataset.cat as Category | 'all';
        this.renderCollection();
      });
    });
    document.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sounds.tap();
        document.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentSort = btn.dataset.sort as 'recent' | 'rarity' | 'category';
        this.renderCollection();
      });
    });
  }

  private renderCollection(): void {
    const owned = collection.getAll();
    let items = DOLLS.filter((d) => {
      if (this.currentRarityFilter !== 'all' && d.rarity !== this.currentRarityFilter) return false;
      if (this.currentCategoryFilter !== 'all' && d.category !== this.currentCategoryFilter) return false;
      return true;
    });

    const RARITY_RANK: Record<Rarity, number> = { HR: 0, SR: 1, R: 2, N: 3 };
    if (this.currentSort === 'rarity') {
      items = items.slice().sort((a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity]);
    } else if (this.currentSort === 'category') {
      items = items.slice().sort((a, b) => a.category.localeCompare(b.category));
    }
    // recent 는 보유 인형이 먼저 (보유 갯수 내림차순), 미보유 뒤로
    if (this.currentSort === 'recent') {
      items = items.slice().sort((a, b) => (owned[b.id] ?? 0) - (owned[a.id] ?? 0));
    }

    this.$collectionGrid.innerHTML = items
      .map((d) => {
        const count = owned[d.id] ?? 0;
        const isLocked = count === 0;
        return `
          <div class="card ${isLocked ? 'locked' : ''}" data-rarity="${d.rarity}">
            ${count > 1 ? `<div class="card-count">x${count}</div>` : ''}
            <div class="card-art">${isLocked ? '❓' : d.emoji}</div>
            <div class="card-name">${isLocked ? '???' : d.name}</div>
            <div class="card-rarity">${RARITY_LABEL[d.rarity]}</div>
          </div>
        `;
      })
      .join('');

    const { owned: ownedCount, total } = collection.totalProgress();
    this.$collectionProgress.innerHTML = `진행도 <strong>${ownedCount} / ${total}</strong> · 컬렉션을 완성하면 추가 플레이 기회를 받을 수 있어요!`;
  }

  // ── 설정 ───────────────────────────────────────────
  private openSettings(): void {
    // 현재 저장 상태로 UI 동기화
    const s = settings.get();
    this.syncDifficultyButtons(s.difficulty);
    this.syncThemeButtons(s.theme);
    this.syncMuteButton(s.muted);
    $('settings-modal').classList.remove('hidden');
  }
  private syncDifficultyButtons(d: Difficulty): void {
    document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((b) => {
      b.classList.toggle('active', b.dataset.difficulty === d);
    });
  }
  private syncThemeButtons(t: ThemeId): void {
    document.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((b) => {
      b.classList.toggle('active', b.dataset.theme === t);
    });
  }
  private syncMuteButton(muted: boolean): void {
    const btn = $('btn-mute') as HTMLButtonElement;
    btn.textContent = muted ? '🔇 꺼짐' : '🔊 켜짐';
    btn.classList.toggle('muted', muted);
  }

  private wireSettings(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sounds.tap();
        const d = btn.dataset.difficulty as Difficulty;
        this.handlers.onDifficulty(d);
        this.syncDifficultyButtons(d);
      });
    });
    document.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sounds.tap();
        const t = btn.dataset.theme as ThemeId;
        this.handlers.onTheme(t);
        this.syncThemeButtons(t);
      });
    });
    $('btn-mute').addEventListener('click', () => {
      const cur = settings.get();
      const next = !cur.muted;
      settings.patch({ muted: next });
      sounds.setMuted(next);
      if (!next) sounds.tap();
      this.syncMuteButton(next);
    });
  }

  private wireRefill(): void {
    $('btn-refill').addEventListener('click', () => {
      sounds.collect();
      this.handlers.onRefill();
      this.refreshPlays();
    });
  }

  private wireCameraExtras(): void {
    $('btn-cam-save').addEventListener('click', () => {
      sounds.tap();
      this.handlers.onSaveCamera();
      this.refreshCustomCamButton();
      this.flashStatus('현재 앵글을 저장했어요 💾');
    });
    $('btn-cam-load').addEventListener('click', () => {
      sounds.tap();
      const ok = this.handlers.onLoadCamera();
      if (ok) {
        document.querySelectorAll('.cam-btn[data-cam]').forEach((b) => b.classList.remove('active'));
        const auto = $('btn-auto-rotate');
        auto.classList.remove('active');
        this.flashStatus('내 앵글로 이동했어요 📂');
      }
    });
  }

  private refreshCustomCamButton(): void {
    try {
      const has = !!localStorage.getItem('allone-doll:custom-camera') &&
        localStorage.getItem('allone-doll:custom-camera') !== 'null';
      ($('btn-cam-load') as HTMLButtonElement).disabled = !has;
    } catch { /* */ }
  }

  flashStatus(text: string): void {
    const prev = this.$status.textContent;
    this.$status.textContent = text;
    setTimeout(() => {
      if (this.$status.textContent === text) this.$status.textContent = prev ?? '';
    }, 1500);
  }

  // ── 응모권 (§2.3) ─────────────────────────────────────
  private renderTickets(): void {
    const $list = $('tickets-list');
    const all = tickets.list();
    if (all.length === 0) {
      $list.innerHTML = `<div class="tickets-empty">아직 응모권이 없어요.<br/>인형뽑기 성공 후 '경품 응모권' 을 선택하면 여기에 쌓여요!</div>`;
      return;
    }
    $list.innerHTML = all.map((t) => this.ticketCardHtml(t)).join('');
    // 액션 버튼 위임 핸들러
    $list.querySelectorAll<HTMLButtonElement>('[data-ticket-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.ticketId!;
        const action = btn.dataset.ticketAction!;
        sounds.tap();
        if (action === 'reveal') {
          const result = tickets.reveal(id);
          if (result?.status === 'won') {
            sounds.success();
            this.openAddressModal(result);
          } else {
            sounds.fail();
            this.flashStatus('아쉽게도 다음 기회에... 🍀');
          }
          this.renderTickets();
          this.refreshTabBadges();
        } else if (action === 'address') {
          const t = all.find((x) => x.id === id);
          if (t) this.openAddressModal(t);
        }
      });
    });
  }

  private ticketCardHtml(t: Ticket): string {
    const date = new Date(t.acquiredAt).toLocaleDateString('ko-KR');
    let statusBadge = '';
    let action = '';
    let title = t.category;
    let sub = `획득 ${date}`;
    if (t.status === 'pending') {
      statusBadge = `<span class="ticket-status pending">응모 대기</span>`;
      action = `<button class="ticket-action primary" data-ticket-action="reveal" data-ticket-id="${t.id}">결과 확인</button>`;
    } else if (t.status === 'won') {
      title = t.prizeName ?? t.category;
      sub = `🎉 당첨! ${date}`;
      if (t.shipping === 'address-needed') {
        statusBadge = `<span class="ticket-status won">주소 필요</span>`;
        action = `<button class="ticket-action primary" data-ticket-action="address" data-ticket-id="${t.id}">주소 입력</button>`;
      } else if (t.shipping === 'shipping') {
        statusBadge = `<span class="ticket-status shipping">배송 중</span>`;
        sub = `송장 ${t.trackingNo}`;
      } else if (t.shipping === 'delivered') {
        statusBadge = `<span class="ticket-status delivered">배송 완료</span>`;
      }
    } else if (t.status === 'lost') {
      statusBadge = `<span class="ticket-status lost">미당첨</span>`;
    }
    return `
      <div class="ticket-item">
        <div class="ticket-emoji">🎟️</div>
        <div class="ticket-body">
          <div class="ticket-title">${title}</div>
          <div class="ticket-sub">${sub}</div>
          ${statusBadge}
        </div>
        ${action}
      </div>
    `;
  }

  private openAddressModal(t: Ticket): void {
    const $m = $('address-modal');
    ($('address-prize') as HTMLElement).textContent = `🎁 ${t.prizeName ?? t.category}`;
    const $input = $('address-input') as HTMLInputElement;
    $input.value = t.address ?? '';
    $m.classList.remove('hidden');
    const save = () => {
      const v = $input.value.trim();
      if (!v) { this.flashStatus('주소를 입력해주세요'); return; }
      tickets.saveAddress(t.id, v);
      sounds.collect();
      $m.classList.add('hidden');
      this.renderTickets();
    };
    ($('btn-save-address') as HTMLButtonElement).onclick = save;
  }

  // ── 미션 (§4.2) ────────────────────────────────────────
  private renderMissions(): void {
    const $list = $('missions-list');
    const s = missions.state();
    $list.innerHTML = MISSIONS.map((m) => {
      const cur = s.progress[m.id] ?? 0;
      const claimed = s.claimed[m.id] === true;
      const ready = !claimed && cur >= m.goal;
      let actionBtn = '';
      if (claimed) {
        actionBtn = `<span class="ticket-status delivered">완료</span>`;
      } else if (ready) {
        actionBtn = `<button class="ticket-action primary" data-mission="claim" data-id="${m.id}">+${m.reward} 회 받기</button>`;
      } else if (m.manualComplete) {
        actionBtn = `<button class="ticket-action" data-mission="complete" data-id="${m.id}">완료 표시</button>`;
      } else {
        actionBtn = `<span class="ticket-status pending">자동 진행</span>`;
      }
      return `
        <div class="mission-item ${claimed ? 'claimed' : ''}">
          <div class="mission-emoji">${m.emoji}</div>
          <div class="mission-body">
            <div class="mission-title">${m.title}</div>
            <div class="mission-desc">${m.description}</div>
            <div class="mission-reward">보상 +${m.reward} 회</div>
            <div class="mission-progress">진행 ${cur} / ${m.goal}</div>
          </div>
          ${actionBtn}
        </div>
      `;
    }).join('');

    $list.querySelectorAll<HTMLButtonElement>('[data-mission]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sounds.tap();
        const id = btn.dataset.id as MissionTrigger;
        const action = btn.dataset.mission!;
        if (action === 'complete') {
          this.handlers.onMissionComplete(id);
        } else if (action === 'claim') {
          const reward = missions.claim(id);
          if (reward) {
            // plays.grant 는 onClaim 콜백이 없어도 직접 처리
            this.flashStatus(`+${reward} 회 적립! 🎉`);
            sounds.collect();
          }
        }
        this.renderMissions();
        this.refreshTabBadges();
        this.refreshPlays();
      });
    });
  }

  // ── 성취 (§3.2.4) ──────────────────────────────────────
  private renderAchievements(): void {
    const $grid = $('achievements-grid');
    const list = achievements.list();
    $grid.innerHTML = ACHIEVEMENTS.map((a) => {
      const u = list.find((x) => x.id === a.id);
      const unlocked = !!u?.unlockedAt;
      return `
        <div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
          <div class="ach-emoji">${unlocked ? a.emoji : '🔒'}</div>
          <div class="ach-title">${unlocked ? a.title : '???'}</div>
          <div class="ach-desc">${unlocked ? a.description : '아직 잠겨있어요'}</div>
        </div>
      `;
    }).join('');
    const unlockedN = achievements.unlockedCount();
    ($('achievements-progress') as HTMLElement).innerHTML =
      `달성 <strong>${unlockedN} / ${ACHIEVEMENTS.length}</strong> 개 — 더 많이 플레이할수록 잠금 해제!`;
  }

  // ── 친구 초대 (§4.3) ──────────────────────────────────
  private wireReferral(): void {
    $('btn-share').addEventListener('click', async () => {
      sounds.tap();
      const url = referral.shareUrl();
      try {
        if (navigator.share) {
          await navigator.share({ title: '올원 CRANE FEVER', text: '같이 인형뽑기 해요!', url });
        } else {
          await this.copyToClipboard(url);
          this.flashStatus('링크가 복사됐어요 📋');
        }
      } catch { /* user canceled share */ }
    });
    $('btn-copy').addEventListener('click', async () => {
      sounds.tap();
      await this.copyToClipboard(referral.shareUrl());
      this.flashStatus('링크가 복사됐어요 📋');
    });
    $('btn-simulate-invite').addEventListener('click', () => {
      sounds.collect();
      const r = referral.simulateValidatedInvite();
      this.flashStatus(`친구 초대 성공! +${r.reward} 회 획득`);
      this.renderReferral();
      this.refreshPlays();
    });
  }

  private renderReferral(): void {
    const url = referral.shareUrl();
    const count = referral.invitedCount();
    ($('referral-url') as HTMLElement).textContent = url;
    ($('referral-stats') as HTMLElement).innerHTML =
      `지금까지 <strong>${count}</strong> 명을 초대했어요. 친구가 게임을 3회 이상 플레이하면 +3 회 적립!`;
  }

  private async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* */ }
      document.body.removeChild(ta);
    }
  }

  // ── 보상 모달 후처리 (§2.2 — 앱 이동 + 비인증 임시 저장) ──
  private wireRewardAfter(): void {
    this.$rewardGoApp.addEventListener('click', () => {
      sounds.tap();
      this.openLinkModal();
    });
  }

  private openLinkModal(): void {
    const $m = $('link-modal');
    const $body = $('link-body');
    const linked = auth.isLinked();
    const stash = auth.state();

    if (linked) {
      $body.innerHTML = `
        <p>이미 올원뱅크 앱과 연동되어 있어요.</p>
        <div class="link-name">${auth.state().name ?? '회원'}</div>
        <p class="settings-hint">실제 앱에서는 적립된 포인트와 응모권을 확인할 수 있어요.</p>
        <div class="link-actions">
          <button class="reward-btn primary" id="link-go">📱 올원뱅크 앱으로 이동 (mock)</button>
          <button class="reward-btn" id="link-unlink">연동 해제</button>
        </div>
      `;
      ($('link-go') as HTMLButtonElement).onclick = () => {
        this.flashStatus('실제 환경에서는 딥링크로 앱 실행 📲');
        $m.classList.add('hidden');
      };
      ($('link-unlink') as HTMLButtonElement).onclick = () => {
        auth.unlink();
        this.flashStatus('연동을 해제했어요');
        this.openLinkModal();
      };
    } else {
      $body.innerHTML = `
        <p>올원뱅크 앱과 연동하면 게임에서 획득한 보상을 자동으로 적립할 수 있어요.</p>
        ${stash.pendingPoints > 0 || stash.pendingTickets > 0
          ? `<div class="referral-stats" style="margin: 10px 0;">
               임시 보관 중: <strong>${stash.pendingPoints}P</strong> / <strong>${stash.pendingTickets}매</strong>
             </div>` : ''}
        <p class="settings-hint">⚠️ 실제 OAuth 연동은 백엔드 도입 시 활성화됩니다. 지금은 mock으로 즉시 연결됩니다.</p>
        <div class="link-actions">
          <button class="reward-btn primary" id="link-do">🔗 mock 연동하기</button>
          <button class="reward-btn" id="link-skip">나중에 하기</button>
        </div>
      `;
      ($('link-do') as HTMLButtonElement).onclick = () => {
        auth.link();
        const flushed = auth.flushStashed();
        sounds.collect();
        if (flushed.points || flushed.tickets) {
          this.flashStatus(`임시 적립금 적립 완료! ${flushed.points}P / 응모권 ${flushed.tickets}매`);
        } else {
          this.flashStatus('연동이 완료됐어요 ✨');
        }
        $m.classList.add('hidden');
      };
      ($('link-skip') as HTMLButtonElement).onclick = () => {
        $m.classList.add('hidden');
      };
    }
    $m.classList.remove('hidden');
  }

  // ── 로딩 팁 ────────────────────────────────────────────
  private showRandomLoadingTip(): void {
    const tips = [
      '바닥의 <strong>초록 링</strong> 안에 인형 중심이 있을 때만 잡혀요',
      '<strong>휠/핀치</strong>로 줌 가능, 드래그로 카메라 회전',
      '<strong>방향키 / WASD</strong> 또는 D-pad 로 크레인 이동',
      '<strong>Space / Enter</strong> 키로도 잡기 가능',
      '<strong>설정 ⚙️</strong> 에서 난이도와 테마를 바꿔보세요',
      '연속 성공할수록 난이도가 살짝 올라가요',
      '⚙️ → <strong>별밤 픽셀</strong> 테마는 Kirby 같은 분위기',
      '컬렉션 카테고리를 다 모으면 <strong>+3 회</strong> 보너스',
      '<strong>친구 초대</strong> 한 명당 +3 회 적립',
    ];
    const t = tips[(Math.random() * tips.length) | 0];
    this.$loadingTip.innerHTML = `💡 <strong>TIP</strong> — ${t}`;
  }

  showCompletionToast(category: string): void {
    const labelMap: Record<string, string> = {
      season: '🌸 올원 계절 시리즈',
      fashion: '👗 올원 패션 시리즈',
      fantasy: '✨ 올원 판타지 시리즈',
      daily: '🌟 올원 일상 시리즈',
    };
    this.$failToast.textContent = `${labelMap[category] ?? category} 컬렉션 완성! +3 추가 플레이 기회 획득`;
    this.$failToast.style.background = 'linear-gradient(135deg, #ffd23f, #ff8c5a)';
    this.$failToast.style.color = '#000';
    this.$failToast.classList.remove('hidden');
    setTimeout(() => {
      this.$failToast.classList.add('hidden');
      this.$failToast.style.background = '';
      this.$failToast.style.color = '';
    }, 3000);
  }
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element not found: #${id}`);
  return el;
}

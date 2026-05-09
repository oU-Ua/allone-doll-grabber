import { load, save } from './storage';

export type Difficulty = 'easy' | 'normal' | 'hard';
export type ThemeId = 'candy' | 'starry' | 'mint' | 'lavender';
const VALID_THEMES: ThemeId[] = ['candy', 'starry', 'mint', 'lavender'];

export interface SettingsState {
  muted: boolean;
  difficulty: Difficulty;
  theme: ThemeId;
}

const KEY = 'settings';
const DEFAULT: SettingsState = {
  muted: false,
  difficulty: 'normal',
  theme: 'candy',
};

let cached: SettingsState | null = null;

export const settings = {
  get(): SettingsState {
    if (!cached) {
      const stored = load<Partial<SettingsState>>(KEY, {});
      cached = { ...DEFAULT, ...stored };
      // 이전 버전(neon/sunset/...)에서 저장된 값이 있으면 기본 테마로 복귀
      if (!VALID_THEMES.includes(cached.theme)) cached.theme = DEFAULT.theme;
    }
    return cached;
  },
  patch(p: Partial<SettingsState>): SettingsState {
    cached = { ...this.get(), ...p };
    save(KEY, cached);
    return cached;
  },
};

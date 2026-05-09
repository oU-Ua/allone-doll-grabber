import { load, save } from './storage';

export interface CustomCameraView {
  pos: [number, number, number];
  look: [number, number, number];
}

const KEY = 'custom-camera';

export const customCamera = {
  get(): CustomCameraView | null {
    return load<CustomCameraView | null>(KEY, null);
  },
  save(view: CustomCameraView): void {
    save(KEY, view);
  },
  clear(): void {
    save(KEY, null);
  },
};

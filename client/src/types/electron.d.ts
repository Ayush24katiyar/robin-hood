/**
 * Electron bridge types for renderer.
 * `window.rb` exists only inside Electron (preload.js); web dev falls back to fetch.
 */
export type RBStatusEvent = { status: "capturing" | "answering"; kb?: number };
export type RBAnswerEvent = { answer: string };
export type RBErrorEvent = { message: string };

export type RBBridge = {
  capture: () => Promise<void>;
  cancelDrag: () => Promise<boolean>;
  setInteractive: (on: boolean) => Promise<boolean>;
  resize: (w: number, h: number) => Promise<boolean>;
  minimize: () => Promise<boolean>;
  toggleCompact: () => Promise<boolean>;
  hide: () => Promise<boolean>;
  toggleClickThrough: () => Promise<boolean>;
  quit: () => Promise<void>;
  onStatus: (fn: (v: RBStatusEvent) => void) => () => void;
  onAnswer: (fn: (v: RBAnswerEvent) => void) => () => void;
  onAnswerError: (fn: (v: RBErrorEvent) => void) => () => void;
  onClickThrough: (fn: (v: boolean) => void) => () => void;
  onDragMode: (fn: (v: { on: boolean }) => void) => () => void;
};

declare global {
  interface Window {
    rb?: RBBridge;
  }
}

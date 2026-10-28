/** The slice of the 2D canvas API the renderer uses, so tests can pass a recording fake. */
export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'fillRect'
  | 'drawImage'
  | 'fillText'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'save'
  | 'restore'
  | 'setTransform'
  | 'imageSmoothingEnabled'
  | 'globalAlpha'
  | 'clearRect'
>;

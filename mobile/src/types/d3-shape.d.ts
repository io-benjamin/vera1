declare module 'd3-shape' {
  export interface PieGenerator<T> {
    (data: T[]): PieArcDatum<T>[];
    value(fn: (d: T) => number): PieGenerator<T>;
    sort(fn: null | ((a: T, b: T) => number)): PieGenerator<T>;
  }

  export interface PieArcDatum<T> {
    data: T;
    index: number;
    value: number;
    startAngle: number;
    endAngle: number;
    padAngle: number;
  }

  export interface ArcGenerator<T> {
    (d: T): string | null;
    outerRadius(r: number): ArcGenerator<T>;
    innerRadius(r: number): ArcGenerator<T>;
  }

  export function pie<T>(): PieGenerator<T>;
  export function arc<T>(): ArcGenerator<T>;
}

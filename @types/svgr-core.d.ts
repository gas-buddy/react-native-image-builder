interface SvgrSync {
  sync(src: string, config?: any): string;
}

declare module '@svgr/core' {
  const defaultExport: SvgrSync;
  export default defaultExport;
  export const resolveConfig: SvgrSync;
}

declare module "pdfmake/build/pdfmake" {
  const engine: {
    createPdf(definition: unknown, tableLayouts?: undefined, fonts?: undefined, vfs?: Record<string,string>): {
      getStream():{
        on(event:"data",callback:(chunk:Uint8Array)=>void):void;
        on(event:"end",callback:()=>void):void;
        on(event:"error",callback:(error:unknown)=>void):void;
        end():void;
      };
    };
  };
  export default engine;
}
declare module "pdfmake/build/vfs_fonts" {
  const fonts:Record<string,string>;
  export default fonts;
}

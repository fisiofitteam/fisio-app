import type {Viewport} from "next";
export const viewport:Viewport={width:"device-width",initialScale:1,maximumScale:5,userScalable:true,themeColor:"#101211",viewportFit:"cover"};
export default function MetodoLayout({children}:{children:React.ReactNode}){return children;}

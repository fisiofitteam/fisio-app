import {ImageResponse} from "next/og";
export const runtime="edge";
const size={width:1200,height:630};
export function GET(){return new ImageResponse(<div style={{background:"#101211",color:"white",width:"100%",height:"100%",display:"flex",flexDirection:"column",padding:"70px 80px",fontFamily:"sans-serif"}}><div style={{display:"flex",fontSize:32,fontWeight:700}}>FISIO<span style={{color:"#fbbf24"}}>FIT</span>TEAM</div><div style={{display:"flex",fontSize:68,fontWeight:700,lineHeight:1.08,marginTop:55,maxWidth:1000}}>Vuelve a disfrutar del crosstraining.</div><div style={{display:"flex",fontSize:30,color:"#c3cdc5",marginTop:28}}>Conoce nuestra forma de trabajar.</div><div style={{display:"flex",height:12,background:"#fbbf24",width:180,marginTop:45}}/></div>,size);}

import type {CSSProperties} from 'react';
export type IconName='branch'|'shield'|'check'|'flask'|'code'|'file'|'layers'|'arrow'|'spark'|'link'|'github';
const paths:Record<IconName,string>={
 branch:'M6 3v12a4 4 0 004 4h2M6 7a4 4 0 004 4h4a4 4 0 004-4V3M3 3a3 3 0 106 0 3 3 0 10-6 0M15 3a3 3 0 106 0 3 3 0 10-6 0M12 19a3 3 0 106 0 3 3 0 10-6 0',
 shield:'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3zM8 12l3 3 5-6',
 check:'M5 12l4 4L19 6',flask:'M9 3h6M10 3v7l-6 9a1 1 0 001 2h14a1 1 0 001-2l-6-9V3M7 15h10',
 code:'M8 6l-6 6 6 6M16 6l6 6-6 6M14 3l-4 18',file:'M6 2h8l4 4v16H6V2zM14 2v5h4M9 12h6M9 16h6',
 layers:'M12 2L2 7l10 5 10-5-10-5zM2 12l10 5 10-5M2 17l10 5 10-5',arrow:'M4 12h15M13 6l6 6-6 6',
 spark:'M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2z',link:'M9 15l6-6M8 16l-1 1a4 4 0 01-6-6l4-4a4 4 0 016 0M16 8l1-1a4 4 0 016 6l-4 4a4 4 0 01-6 0',
 github:'M9 19c-4 1-4-2-6-2m12 5v-4a3 3 0 00-1-2c4 0 7-2 7-6a5 5 0 00-1-3 4 4 0 000-4s-2 0-4 2a13 13 0 00-8 0C6 3 4 3 4 3a4 4 0 000 4 5 5 0 00-1 3c0 4 3 6 7 6a3 3 0 00-1 2v4',
};
export default function MarketingIcon({name,size=20,className,style}:{name:IconName;size?:number;className?:string;style?:CSSProperties}) {
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}><path d={paths[name]}/></svg>;
}
